// dsh-secondhand-slang — 在线更新器。从上游两个 MIT 仓库拉取最新词典。
// 路线优先级：GitHub API（实测国内可达）→ jsDelivr CDN（冗余）。
// 代码 MIT。
const MAX_BYTES = 5 * 1024 * 1024; // 与乔木 RSS 的 feed 上限一致，防超大响应撑爆内存

export const SOURCES = [
  {
    id: "xianyu-slang-helper",
    kind: "ext",
    urls: [
      {
        url: "https://api.github.com/repos/memos-im/xianyu-slang-helper/contents/data/dictionary.source.json",
        headers: { Accept: "application/vnd.github.raw+json" },
      },
      {
        url: "https://cdn.jsdelivr.net/gh/memos-im/xianyu-slang-helper@main/data/dictionary.source.json",
      },
    ],
    validate: (d) => Array.isArray(d?.categories),
  },
  {
    id: "awesome-chinese-secondhand-slang",
    kind: "awesome",
    urls: [
      {
        url: "https://api.github.com/repos/Domainsun/awesome-chinese-secondhand-slang/contents/data/slang-dictionary.json",
        headers: { Accept: "application/vnd.github.raw+json" },
      },
      {
        url: "https://cdn.jsdelivr.net/gh/Domainsun/awesome-chinese-secondhand-slang@main/data/slang-dictionary.json",
      },
    ],
    validate: (d) => Array.isArray(d) && d.length > 0,
  },
];

async function fetchJson(route, fetchImpl) {
  const res = await fetchImpl(route.url, {
    headers: route.headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error(`响应过大（${buf.byteLength} 字节，上限 ${MAX_BYTES}）`);
  return JSON.parse(new TextDecoder().decode(buf));
}

/** 简单版本比较（本插件自用，X.Y.Z 与 X.Y.Z-rc.N）：返回 >0 / 0 / <0；同号时 rc < 正式版。 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(String(v).trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])];
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const RELEASE_API = "https://api.github.com/repos/SicutEst/dsh-secondhand-slang/releases/latest";

/** 查询本插件在 GitHub 上的最新 Release。失败抛错（调用方自行降级）。 */
export async function fetchLatestPluginRelease(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 512 * 1024) throw new Error("响应过大");
  const rel = JSON.parse(new TextDecoder().decode(buf));
  const version = typeof rel.tag_name === "string" ? rel.tag_name.replace(/^v/, "").trim() : "";
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`无法解析版本号: ${rel.tag_name}`);
  const asset = (Array.isArray(rel.assets) ? rel.assets : []).find(
    (a) => typeof a?.name === "string" && a.name.endsWith(".tgz")
  );
  return { version, htmlUrl: typeof rel.html_url === "string" ? rel.html_url : "", assetUrl: asset?.browser_download_url ?? "" };
}

/**
 * 拉取全部源。单源失败不影响其它源；全部失败才抛错。
 * 返回 { raw: {ext, awesome}, via: {源id: 命中的主机}, errors: string[] }
 */
export async function fetchLatest(fetchImpl = globalThis.fetch) {
  const raw = { ext: null, awesome: null };
  const via = {};
  const errors = [];
  await Promise.all(
    SOURCES.map(async (s) => {
      for (const route of s.urls) {
        try {
          const data = await fetchJson(route, fetchImpl);
          if (!s.validate(data)) throw new Error("数据格式校验未通过");
          if (s.kind === "ext") raw.ext = data;
          else raw.awesome = data;
          via[s.id] = new URL(route.url).host;
          return;
        } catch (e) {
          errors.push(`${s.id} @ ${new URL(route.url).host}: ${e.message}`);
        }
      }
    })
  );
  if (!raw.ext && !raw.awesome) throw new Error(`所有更新源均不可达：${errors.join("; ")}`);
  return { raw, via, errors };
}
