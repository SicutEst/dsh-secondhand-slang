// dsh-secondhand-slang — 纯查询/合并逻辑，不依赖 DSH 运行时，可独立测试。
// 代码 MIT。数据来源（均为 MIT）：
//   - memos-im/xianyu-slang-helper 的 data/dictionary.source.json
//   - Domainsun/awesome-chinese-secondhand-slang 的 data/slang-dictionary.json
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const lower = (s) => (s ?? "").toString().toLowerCase().trim();

/** 把两份上游原始 JSON 解析为统一的词条数组。 */
export function parseRaw(ext, awesome) {
  const concepts = [];

  // 形态一：{ categories: [{ id, name, entries: { 词条: [变体...] } }] }
  for (const cat of ext?.categories ?? []) {
    for (const [term, variants] of Object.entries(cat.entries ?? {})) {
      if (!Array.isArray(variants)) continue;
      const clean = variants.filter((v) => typeof v === "string" && v.trim());
      if (clean.length === 0) continue;
      concepts.push({ name: term, category: cat.name || cat.id || "", variants: clean, source: "xianyu-slang-helper" });
    }
  }

  // 形态二：[{ standardName, category, slangVariants: [...] }]
  for (const item of Array.isArray(awesome) ? awesome : []) {
    const name = typeof item.standardName === "string" ? item.standardName.trim() : "";
    const clean = (item.slangVariants ?? []).filter((v) => typeof v === "string" && v.trim());
    if (!name || clean.length === 0) continue;
    concepts.push({ name, category: item.category ?? "", variants: clean, source: "awesome-chinese-secondhand-slang" });
  }

  return concepts;
}

/** 读取随包内置的词典快照。 */
export async function loadBundled(dataDir = join(__dirname, "..", "data")) {
  const [ext, awesome] = await Promise.all([
    readFile(join(dataDir, "dictionary.source.json"), "utf8").then(JSON.parse),
    readFile(join(dataDir, "slang-dictionary-awesome.json"), "utf8")
      .then(JSON.parse)
      .catch(() => []),
  ]);
  return parseRaw(ext, awesome);
}

/** 旧测试兼容别名。 */
export const loadConcepts = () => loadBundled();

/** 合并多份词条：按 name+category 去重，同名词条变体合并去重（大小写不敏感）。 */
export function mergeConcepts(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const c of list) {
      if (!c || typeof c.name !== "string") continue;
      const key = `${c.name.trim()}‖${(c.category ?? "").trim()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...c, variants: [...c.variants] });
        continue;
      }
      const seen = new Set(existing.variants.map(lower));
      for (const v of c.variants) {
        const lv = lower(v);
        if (!seen.has(lv)) {
          seen.add(lv);
          existing.variants.push(v);
        }
      }
    }
  }
  return [...byKey.values()];
}

/**
 * 正向查询：商品/概念 → 黑话叫法。term 为空时返回分类总览。
 */
export function lookup(concepts, term, limit = 10) {
  if (!term || !String(term).trim()) {
    const byCat = new Map();
    for (const c of concepts) byCat.set(c.category || "未分类", (byCat.get(c.category || "未分类") ?? 0) + 1);
    const lines = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => `- ${cat}: ${n} 个词条`);
    return `词典共 ${concepts.length} 个词条，按分类：\n${lines.join("\n")}\n\n传入 term 查某个词的黑话叫法（如 term: "iPhone"）。`;
  }

  const q = lower(term);
  const scored = [];
  for (const c of concepts) {
    const n = lower(c.name);
    let score = 0;
    if (n === q) score = 100;
    else if (n.includes(q)) score = 80 - Math.min(n.length, 40);
    else {
      for (const v of c.variants) {
        const lv = lower(v);
        if (lv === q) { score = Math.max(score, 60); break; }
        if (lv.includes(q)) score = Math.max(score, 40);
      }
    }
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit);
  if (top.length === 0) {
    return `词典里没有找到「${term}」。可以试更短的关键词、用 slang_decode 反查黑话，或留空 term 查看全部分类。`;
  }

  const blocks = top.map(({ c }) => {
    const shown = c.variants.slice(0, 20);
    const more = c.variants.length > shown.length ? ` …（共 ${c.variants.length} 个变体，已截断）` : "";
    return `【${c.name}】分类: ${c.category || "未分类"} · 来源: ${c.source}\n${shown.map((v) => `- ${v}`).join("\n")}${more}`;
  });
  return `「${term}」的查询结果（命中 ${scored.length} 条，显示前 ${top.length} 条）：\n\n${blocks.join("\n\n")}\n\n提示：复制叫法到闲鱼/转转等平台搜索即可；黑话会过期，搜不到就多试几个变体。`;
}

/**
 * 反向解读：黑话 → 实际含义。
 */
export function decode(concepts, slang, limit = 10) {
  const q = lower(slang);
  if (!q) return "请提供要解读的黑话（slang 参数）。";

  const exact = [];
  const partial = [];
  for (const c of concepts) {
    let hit = "none";
    for (const v of c.variants) {
      const lv = lower(v);
      if (lv === q) { hit = "exact"; break; }
      // 短变体（<2 字符）只允许精确命中，避免单字/双字母的模糊误报
      const fuzzable = lv.length >= 2 && q.length >= 2;
      if (fuzzable && (lv.includes(q) || q.includes(lv))) hit = "partial";
    }
    if (hit === "exact") exact.push(c);
    else if (hit === "partial") partial.push(c);
  }

  const hits = [...exact, ...partial].slice(0, limit);
  if (hits.length === 0) return `词典里没有收录黑话「${slang}」。`;

  const blocks = hits.map((c) => {
    const matched = c.variants
      .filter((v) => {
        const lv = lower(v);
        if (lv === q) return true;
        if (lv.length < 2 || q.length < 2) return false;
        return lv.includes(q) || q.includes(lv);
      })
      .slice(0, 8);
    return `「${slang}」→ 【${c.name}】（分类: ${c.category || "未分类"}）\n相关叫法: ${matched.join("、")}`;
  });
  const suffix = exact.length > 0 ? "" : "\n\n（以上为模糊匹配，请结合语境甄别。）";
  return `${blocks.join("\n\n")}${suffix}`;
}
