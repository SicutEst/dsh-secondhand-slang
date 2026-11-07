// 独立测试：不依赖 DSH 运行时与网络，验证数据加载、查询、合并、更新器与存储逻辑。
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundled, parseRaw, mergeConcepts, lookup, decode } from "./lib/lookup.js";
import { fetchLatest } from "./lib/updater.js";
import { loadStorage, saveStorage } from "./lib/storage.js";

// --- 数据加载 ---
const concepts = await loadBundled();
console.log(`[load] ${concepts.length} 个词条`);
if (concepts.length < 100) throw new Error("词条数异常，检查 data/ 文件");

// --- 查询 ---
console.log("\n=== lookup/decode 抽查 ===");
for (const t of ["iPhone", "茅台", "动森"]) {
  const out = lookup(concepts, t);
  if (out.includes("没有找到")) throw new Error(`正向查询 ${t} 意外未命中`);
  console.log(`lookup "${t}" -> ${out.split("\n")[0]}`);
}
for (const s of ["猛男捡树枝", "绿泡泡", "给他爱"]) {
  const out = decode(concepts, s);
  if (out.includes("没有收录")) throw new Error(`反向解读 ${s} 意外未命中`);
  console.log(`decode "${s}" -> ${out.split("\n")[0]}`);
}

// --- parseRaw：坏数据不炸 ---
if (parseRaw(null, null).length !== 0) throw new Error("parseRaw 空数据应返回空数组");
if (parseRaw({ categories: [{ entries: { a: "not-array" } }] }, [{ standardName: "", slangVariants: ["x"] }]).length !== 0)
  throw new Error("parseRaw 应过滤非法词条");

// --- mergeConcepts：去重与变体合并 ---
const a = { name: "iPhone", category: "电子产品", variants: ["艾疯", "爱疯"], source: "s1" };
const b = { name: "iPhone", category: "电子产品", variants: ["爱疯", "小i"], source: "s2" };
const merged = mergeConcepts([a], [b]);
if (merged.length !== 1) throw new Error("同名同分类应合并为一条");
if (merged[0].variants.length !== 3) throw new Error(`变体应去重合并为 3，实际 ${merged[0].variants.length}`);
const c2 = { name: "iPhone", category: "别的分类", variants: ["x"], source: "s1" };
if (mergeConcepts([a], [c2]).length !== 2) throw new Error("同名不同分类应保留两条");
console.log("[merge] 去重与合并 OK");

// --- fetchLatest：主路线失败自动切换备用路线 ---
const enc = (obj) => new TextEncoder().encode(JSON.stringify(obj));
const respond = (obj) => ({ ok: true, arrayBuffer: async () => enc(obj).buffer });
const mockFetch = (url) => {
  if (url.includes("api.github.com/repos/memos-im")) {
    return Promise.resolve({ ok: false, status: 503 });
  }
  if (url.includes("api.github.com")) {
    return Promise.resolve(respond([{ standardName: "测试概念", category: "test", slangVariants: ["测试变体"] }]));
  }
  if (url.includes("cdn.jsdelivr.net/gh/memos-im")) {
    return Promise.resolve(respond({ categories: [{ name: "测试", entries: { 测试词: ["测试叫法"] } }] }));
  }
  return Promise.reject(new Error("unexpected url " + url));
};
const { raw, via, errors } = await fetchLatest(mockFetch);
if (!raw.ext || !raw.awesome) throw new Error("mock 拉取结果不完整");
if (via["xianyu-slang-helper"] !== "cdn.jsdelivr.net") throw new Error("主路线失败应切换 jsdelivr");
if (errors.length !== 1 || !errors[0].includes("503")) throw new Error("应记录一条主路线失败");
if (parseRaw(raw.ext, raw.awesome).length !== 2) throw new Error("mock 数据解析条数不对");
console.log("[updater] 路线降级与校验 OK");

// --- fetchLatest：超大响应被拒 ---
let sizeErr = null;
try {
  await fetchLatest(() => Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024) }));
} catch (e) {
  sizeErr = e;
}
if (!sizeErr) throw new Error("超过 5MB 的响应应被拒绝");
console.log("[updater] 大小上限 OK");

// --- storage：损坏文件不炸查询 ---
const tmp = mkdtempSync(join(tmpdir(), "slang-test-"));
const sp = join(tmp, "concepts.json");
writeFileSync(sp, JSON.stringify({
  savedAt: new Date().toISOString(),
  concepts: [
    a, // 合法
    { name: "坏词条", category: "x", variants: "not-array" }, // variants 非数组
    { name: "", category: "x", variants: ["y"] }, // 空名
    null, // 整个为 null
    { name: "坏变体", category: "x", variants: ["ok", 123] }, // 变体混入非字符串
  ],
}));
const loaded = await loadStorage(sp);
if (!loaded || loaded.concepts.length !== 1) throw new Error(`损坏存储应剔除坏词条只留 1 条，实际 ${loaded?.concepts.length}`);
if (lookup(loaded.concepts, "iPhone").includes("没有找到")) throw new Error("剔除后合法词条应可查询");
// 全坏 → null（回落内置）
writeFileSync(sp, JSON.stringify({ savedAt: "x", concepts: [{ bad: true }] }));
if ((await loadStorage(sp)) !== null) throw new Error("全部损坏应返回 null 回落内置快照");
// 正常读写回环
await saveStorage(sp, [a]);
const rt = await loadStorage(sp);
if (rt.concepts.length !== 1 || rt.concepts[0].name !== "iPhone") throw new Error("存储读写回环失败");
rmSync(tmp, { recursive: true, force: true });
console.log("[storage] 损坏容错与读写回环 OK");

// --- 未命中时的相近词条推荐 ---
const miss = lookup(concepts, "RTX 4060");
console.log("\n=== miss 推荐示例（RTX 4060）===");
console.log(miss.split("\n").slice(0, 7).join("\n"));
if (!miss.includes("相近词条")) throw new Error("未命中时应给出相近词条推荐");
if (!miss.includes("3060")) throw new Error("RTX 4060 应推荐到 3060 相关词条");
const gibberish = lookup(concepts, "qqqzzz");
if (gibberish.includes("相近词条")) throw new Error("完全无关联的词不应有推荐");

// --- 方向判断（斜杠命令的调度依据）---
const { findExactByVariant } = await import("./lib/lookup.js");
if (!findExactByVariant(concepts, "绿泡泡")) throw new Error("绿泡泡应被识别为黑话变体");
if (!findExactByVariant(concepts, "猛男捡树枝")) throw new Error("猛男捡树枝应被识别为黑话变体");
if (findExactByVariant(concepts, "茅台")) throw new Error("茅台是标准名不是变体，不应命中");
if (findExactByVariant(concepts, "")) throw new Error("空输入不应命中");
console.log("[dispatch] findExactByVariant OK");

console.log("\n[test] 全部通过 ✅");
