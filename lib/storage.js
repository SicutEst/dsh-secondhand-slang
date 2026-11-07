// dsh-secondhand-slang — 本地持久化。不依赖 DSH 运行时，可独立测试。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** 校验单个词条的形状（防御损坏或手改过的存储文件）。 */
function isValidConcept(c) {
  return (
    c &&
    typeof c === "object" &&
    typeof c.name === "string" &&
    c.name.trim() !== "" &&
    typeof c.category === "string" &&
    Array.isArray(c.variants) &&
    c.variants.length > 0 &&
    c.variants.every((v) => typeof v === "string" && v.trim() !== "")
  );
}

/**
 * 读取持久化词典。返回 { concepts, savedAt } 或 null（不存在/损坏时）。
 * 损坏的词条被剔除而不是让整个文件作废；全部损坏才返回 null。
 */
export async function loadStorage(path) {
  if (!path) return null;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.concepts) || typeof parsed.savedAt !== "string") return null;
  const concepts = parsed.concepts.filter(isValidConcept);
  if (concepts.length === 0) return null;
  return { concepts, savedAt: parsed.savedAt };
}

/** 写入持久化词典。 */
export async function saveStorage(path, concepts) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ savedAt: new Date().toISOString(), concepts }));
}
