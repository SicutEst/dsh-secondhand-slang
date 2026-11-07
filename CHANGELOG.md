# Changelog

## 0.2.3 — 2026-11-07

### Fixed
- 更新器增加响应体大小上限（5MB），防止异常超大响应占用内存。
- 自动更新定时器随插件卸载/热重载清理，不再产生孤儿定时器。
- 手动更新与自动更新增加并发锁，避免同时触发时双写存储。
- 持久化文件做逐词条形状校验，损坏/手改的存储不再导致查询崩溃（坏词条剔除、好词条照常可用）。
- 存储写入失败时不再误报整个更新失败：内存数据照常生效，并在结果中明确提示未持久化。

### Changed
- `engines.dsh` 与 peer 依赖版本约束从逐版本枚举放宽为 `>=0.2.1-rc.2`，DSH 后续版本升级不再导致插件被拒装。

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
