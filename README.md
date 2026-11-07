# dsh-secondhand-slang

DeepSeek Harness 的离线二手交易黑话词典插件。想找的东西在闲鱼/转转搜不到？用它查黑话叫法；看不懂标题里的暗号？用它反查含义。**词典全部内置本地，零网络请求，无需代理。**

## 功能

| 工具 | 方向 | 说明 |
|---|---|---|
| `slang_lookup` | 正向 | 输入商品/概念常见说法（iPhone、茅台、动森……），返回对应黑话变体列表；留空返回分类总览 |
| `slang_decode` | 反向 | 输入看不懂的黑话（猛男捡树枝、绿泡泡……），返回它实际指什么 |
| `slang_update` | 更新 | 从上游两个 MIT 仓库拉取最新词典并合并；在对话里说"更新黑话词典"即可触发 |

装好后两种用法：

**斜杠命令（确定性入口，推荐）**——直接执行、不经过模型（查词零 token 消耗）：

```
/slang 茅台          # 查叫法（输入是黑话变体时自动反查含义）
/slang 猛男捡树枝     # 自动识别为黑话 → 返回含义
/slang update        # 更新词典
```

**自然语言**——直接在对话里说人话（"闲鱼上 PS5 用什么黑话搜"、"猛男捡树枝是什么意思"），Agent 会自己调用工具；插件注入的系统提示词会要求 Agent 黑话问题必须查词典、禁止凭记忆编造。

## 自动更新

- 插件启动 15 秒后自动检查一次上游更新；距上次成功更新不足 7 天则跳过，成功后数据持久化到 `~/.dsh/storages/slang-dict/concepts.json`
- 更新路线：GitHub API（国内可直连）→ jsDelivr CDN（冗余）；全部不可达时静默保留现有数据，不影响离线查询
- 两源都拉到时整体替换（上游删除的词条同步消失）；只拉到一源时该源更新、另一源沿用现有数据
- 更新失败可在对话里重试："更新一下黑话词典"

## 数据来源与许可

- 代码：原创，MIT
- 词典一：[memos-im/xianyu-slang-helper](https://github.com/memos-im/xianyu-slang-helper) 的 `data/dictionary.source.json`（README 声明 MIT；约 250 词条 / 896 变体，违法类词条已在源头排除；许可声明见 `data/LICENSE-xianyu-slang-helper.txt`）
- 词典二：[Domainsun/awesome-chinese-secondhand-slang](https://github.com/Domainsun/awesome-chinese-secondhand-slang) 的 `data/slang-dictionary.json`（MIT，约 110 概念 / 4400+ 变体；许可原文见 `data/LICENSE-awesome-chinese-secondhand-slang.txt`）

## 致谢

词典能持续保鲜，靠的是两位上游维护者的辛苦整理，特此致谢：

- **memos-im**（xianyu-slang-helper）—— 每周用自动化流水线从多源同步暗语，经政策过滤、风险变体剔除、AI 噪音复核后人工审阅合并，本插件的数据管线直接受益于他的工作
- **Domainsun**（awesome-chinese-secondhand-slang）—— 从真实用户搜索词出发持续人工扩充中文二手交易暗语词条

黑话有时效性，快照会过期；搜不到时多试几个变体，或在对话里说"更新黑话词典"触发手动更新（也可等每周自动检查）。

## 安装 / 更新

**方式一：从 GitHub Releases 下载（推荐）**

到 [Releases](https://github.com/SicutEst/dsh-secondhand-slang/releases) 下载最新的 `.tgz`，然后：

```sh
dsh plugin --profile desktop add <下载的 .tgz 绝对路径>
```

**方式二：从源码打包**

```sh
npm pack
dsh plugin --profile desktop add <生成的 .tgz 绝对路径>
```

安装后重启对应的 Harness profile。

## 免责

词典仅供二手交易平台购物时理解暗语之用，数据来自开源社区整理，不收录违法类暗号（上游已做政策过滤）。使用时请自行甄别交易合法性与商品真伪。
