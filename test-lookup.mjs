// 独立测试：不依赖 DSH 运行时与网络，验证数据加载、查询、合并与更新器逻辑。
import { loadBundled, parseRaw, mergeConcepts, lookup, decode } from "./lib/lookup.js";
import { fetchLatest } from "./lib/updater.js";

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
if (mergeConcepts([a], [c2]).length !== 2) throw new Error("同 名不同分类应保留两条");
console.log("[merge] 去重与合并 OK");

// --- fetchLatest：主路线失败自动切换备用路线 ---
const mockFetch = (url) => {
  if (url.includes("api.github.com/repos/memos-im")) {
    return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
  }
  if (url.includes("api.github.com")) {
    return Promise.resolve({
      ok: true,
      json: async () => [{ standardName: "测试概念", category: "test", slangVariants: ["测试变体"] }],
    });
  }
  if (url.includes("cdn.jsdelivr.net/gh/memos-im")) {
    return Promise.resolve({ ok: true, json: async () => ({ categories: [{ name: "测试", entries: { 测试词: ["测试叫法"] } }] }) });
  }
  return Promise.reject(new Error("unexpected url " + url));
};
const { raw, via, errors } = await fetchLatest(mockFetch);
if (!raw.ext || !raw.awesome) throw new Error("mock 拉取结果不完整");
if (via["xianyu-slang-helper"] !== "cdn.jsdelivr.net") throw new Error("主路线失败应切换 jsdelivr");
if (errors.length !== 1 || !errors[0].includes("503")) throw new Error("应记录一条主路线失败");
if (parseRaw(raw.ext, raw.awesome).length !== 2) throw new Error("mock 数据解析条数不对");
console.log("[updater] 路线降级与校验 OK");

console.log("\n[test] 全部通过 ✅");
