// dsh-secondhand-slang — DeepSeek Harness 离线二手黑话词典插件。
// 代码原创，MIT。数据来源见 lookup.js 头部注释。
// 注册三个 Agent 工具：
//   slang_lookup  正向查询：商品/概念 → 二手平台黑话叫法
//   slang_decode  反向解读：黑话 → 实际含义
//   slang_update  在线更新：拉取上游 MIT 仓库最新词典并合并
// 启动时若距上次更新超过 7 天，自动静默检查一次（不阻塞启动，失败只记日志）。
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { loadBundled, parseRaw, mergeConcepts, lookup, decode } from "./lookup.js";
import { fetchLatest } from "./updater.js";
import { loadStorage, saveStorage } from "./storage.js";

const text = (value) => [{ type: "text", text: value }];

const AUTO_CHECK_DELAY_MS = 15_000; // 启动后 15 秒再做自动检查，避开启动高峰
const AUTO_CHECK_INTERVAL_MS = 7 * 24 * 3600 * 1000; // 7 天

/** 解析 DSH home 下的持久化路径；独立运行（无宿主）时返回 null，仅用内置数据。 */
async function resolveStoragePath() {
  try {
    const { resolveDshHome } = await import("@deepseek-ai/dsh-home-paths");
    const home = resolveDshHome();
    if (typeof home === "string" && home) return join(home, "storages", "slang-dict", "concepts.json");
  } catch {
    /* 独立测试环境没有宿主包，忽略 */
  }
  return null;
}

var SlangDictService = class {
  static inject = ["tools"];

  constructor(ctx) {
    this.ctx = ctx;
    this.concepts = null;
    this.lastSavedAt = null;
    this.storagePath = null;
    this.updating = null; // 并发保护：手动更新与自动更新共用一个飞行锁
    this.ready = (async () => {
      this.storagePath = await resolveStoragePath();
      const stored = await loadStorage(this.storagePath);
      this.lastSavedAt = stored ? new Date(stored.savedAt) : null;
      this.concepts = stored ? stored.concepts : await loadBundled();
      return this.concepts;
    })();

    ctx.tools.register(
      defineTool({
        name: "slang_lookup",
        description:
          "Look up secondhand-marketplace slang (黑话/暗语/暗号) for a product or term so it can actually be found on Xianyu (闲鱼/Goofish), Zhuanzhuan and similar platforms. Omit term to list all categories. Expect Chinese terms.",
        parameters: {
          term: {
            type: "string",
            description: "商品或概念的常见说法，如 iPhone、茅台、Claude 会员、动森。留空返回分类总览。",
          },
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => text(value),
        },
        execute: async (args) => {
          const concepts = await this.ready;
          return lookup(concepts, args?.term, 10);
        },
      })
    );

    ctx.tools.register(
      defineTool({
        name: "slang_decode",
        description:
          "Decode slang (黑话/暗语) seen on secondhand marketplaces (Xianyu/闲鱼 etc.) back to what product or concept it actually refers to.",
        parameters: {
          slang: {
            type: "string",
            description: "看不懂的黑话词，如 猛男捡树枝、绿泡泡、给他爱",
            required: true,
          },
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => text(value),
        },
        execute: async (args) => {
          const concepts = await this.ready;
          return decode(concepts, args?.slang, 10);
        },
      })
    );

    ctx.tools.register(
      defineTool({
        name: "slang_update",
        description:
          "Check the upstream open-source dictionary repos for newer slang data and merge it in. Run this when lookups seem stale, or when the user asks to 更新黑话词典. Needs network (GitHub API direct, jsDelivr fallback); safe to retry on failure.",
        parameters: {},
        output: {
          schema: { type: "string" },
          render: (_args, value) => text(value),
        },
        execute: async () => {
          try {
            const r = await this.applyUpdate();
            const routes = Object.values(r.via).join("、");
            const errs = r.errors.length > 0 ? `\n部分路线失败（已用可用路线）：${r.errors.join("；")}` : "";
            const persistNote = r.persisted ? "" : "\n注意：新数据已生效但未能写入本地存储（重启后会回到旧数据）。";
            return `词典更新完成：词条 ${r.before} → ${r.after}（数据路线: ${routes}）。${r.after === r.before ? "上游暂无新增。" : ""}后续查询即用新数据。${persistNote}${errs}`;
          } catch (e) {
            return `更新失败：${e.message}\n内置快照仍可正常查询。可稍后重试（网络可达 GitHub 时即可成功）。`;
          }
        },
      })
    );

    ctx.logger?.info?.("dsh-secondhand-slang: started");

    // 启动后静默自动检查；定时器随插件卸载/热重载一并清理，避免孤儿定时器堆积
    const timer = setTimeout(() => {
      void this.autoUpdate().catch((e) =>
        this.ctx.logger?.warn?.(`dsh-secondhand-slang auto-check failed: ${e.message}`)
      );
    }, AUTO_CHECK_DELAY_MS);
    timer.unref?.();
    if (typeof ctx.effect === "function") ctx.effect(() => () => clearTimeout(timer));
  }

  /**
   * 拉取上游并应用（带并发锁）。两源都拿到 → 整体替换（上游删掉的词条同步消失）；
   * 只拿到一源 → 该源替换、另一源沿用现有数据。
   * 持久化失败不影响内存数据生效，只体现在返回值的 persisted 字段。
   */
  applyUpdate() {
    if (this.updating) return this.updating;
    this.updating = (async () => {
      const { raw, via, errors } = await fetchLatest();
      const current = this.concepts ?? (await this.ready);
      const fresh = parseRaw(raw.ext ?? { categories: [] }, raw.awesome ?? []);

      let next;
      if (raw.ext && raw.awesome) {
        next = fresh;
      } else {
        const keep = current.filter((c) =>
          raw.ext ? c.source === "awesome-chinese-secondhand-slang" : c.source === "xianyu-slang-helper"
        );
        next = mergeConcepts(keep, fresh);
      }

      const before = current.length;
      this.concepts = next;
      this.ready = Promise.resolve(next);
      this.lastSavedAt = new Date();
      let persisted = true;
      try {
        await saveStorage(this.storagePath, next);
      } catch (e) {
        persisted = false;
        this.ctx.logger?.warn?.(`dsh-secondhand-slang: storage write failed: ${e.message}`);
      }
      return { before, after: next.length, via, errors, persisted };
    })().finally(() => {
      this.updating = null;
    });
    return this.updating;
  }

  /** 启动后的静默检查：距上次成功更新不足 7 天则跳过。 */
  async autoUpdate() {
    if (this.lastSavedAt && Date.now() - this.lastSavedAt.getTime() < AUTO_CHECK_INTERVAL_MS) return;
    const r = await this.applyUpdate();
    this.ctx.logger?.info?.(`dsh-secondhand-slang: auto-updated ${r.before} -> ${r.after}`);
  }
};

var index_default = SlangDictService;
export { SlangDictService, index_default as default };
