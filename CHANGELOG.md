# Changelog

## 0.2.2 — 2026-11-07

### Changed
- 包更名：`dsh-slang-dict` → `dsh-secondhand-slang`（含义更明确：二手交易平台黑话，覆盖闲鱼/转转/小红书等，且不占用平台商标）。

## 0.2.1 — 2026-11-07

### Changed
- 发布合规：随包分发上游数据的两份许可文本（`data/LICENSE-xianyu-slang-helper.txt` 声明 + `data/LICENSE-awesome-chinese-secondhand-slang.txt` MIT 原文），README 新增正式致谢章节。

## 0.2.0 — 2026-11-07

### Added
- `slang_update` 工具：从上游 MIT 仓库拉取最新词典并合并，对话里说"更新黑话词典"即可触发。
- 启动自动检查：距上次更新超过 7 天时静默拉取更新，数据持久化到 DSH home，失败不影响离线查询。
- 更新路线双保险：GitHub API（主）+ jsDelivr（备）；两源全拿到时整体替换，部分拿到时按源合并。

## 0.1.0 — 2026-11-07

### Added
- 首个版本：`slang_lookup`（正向查黑话叫法）与 `slang_decode`（反向解黑话含义）两个 Agent 工具。
- 内置两份 MIT 词典数据（xianyu-slang-helper 快照 + awesome-chinese-secondhand-slang），本地查询、零网络请求。
