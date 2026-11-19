# 维护手册（MAINTENANCE）

> 位置：`~/.dsh/local-plugins/dsh-narration-policy`（独立于工作区，profile 通过软链引用，清理工作区不会断）。

## 它是什么

给 DeepSeek Harness 全局**追加**一段「过程汇报（Preamble）」系统提示词：让 agent 边干边用一两句话同步「在做什么 / 刚做完什么 / 遇到什么问题、打算怎么解决」，而不是只在开头计划和结尾总结。只注册一段文本，零运行时依赖、无 I/O。

## 目录结构

- `index.js` —— 全部逻辑 + 文案常量 `NARRATION_TEXT`
- `package.json` —— `name: @local/dsh-narration-policy`, `version: 1.0.0`
- `cordis.patch.yml` —— 把插件挂到 profile loader 的一行
- `README.md` —— 给使用者看的概述
- `MAINTENANCE.md` —— 本文件（维护/回滚/排错）

## 改文案（最常做的操作）

1. 改 `index.js` 里的 `NARRATION_TEXT`（只改文字，逻辑别动）。
2. 重装使其生效：
   `plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy`
   （host 插件热加载，通常无需重启；不放心就重启 DSH。）
3. **新建会话**验证，发：「把系统提示词里『过程汇报（Preamble）』那一节原样贴出来」。
4. `git commit` 记录这次改动。

## 安装 / 卸载

- 安装：见 `README.md`（用插件管理器指向本目录绝对路径）。
- 卸载：`plugin_manager action=remove_bundle target=@local/dsh-narration-policy`；
  或手动删 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 条目 + 删 `node_modules/@local/dsh-narration-policy` 软链。

## 验证清单（迁完/改完都跑这 4 项）

1. `plugin_manager list_plugins` → `include:narration-policy` 为 `enabled:true / fiberPhase:active`。
2. `~/.dsh/profiles/desktop/package.json` 依赖行 = `"@local/dsh-narration-policy": "link:~/.dsh/local-plugins/dsh-narration-policy"`，且 `dsh.profile.bundles` 里有该条目。
3. `~/.dsh/profiles/desktop/node_modules/@local/dsh-narration-policy` 软链 → `../../../../local-plugins/dsh-narration-policy`。
4. 新建会话 / 子代理自检能贴出「## 过程汇报（Preamble）」小节。

## 回滚

- 提示词层：移除该 bundle 即恢复「无此段」。
- 渲染层：把 `~/.dsh/profiles/desktop/cordis.patch.yml` 里 `ui-chat.foldedReplies` 改回 `all` 或删掉该行 = 中间文字不再收起。

## 排错 / 坑

- **bundles 被清空**：插件管理器重写 profile `package.json` 时有把 `dsh.profile.bundles` 条目清掉的先例。装/卸别的插件后，`grep @local/dsh-narration-policy ~/.dsh/profiles/desktop/package.json` 确认条目还在；没了就用 `install_bundle` 重装。
- **别再挪回工作区**：工作区 `default-workspace` 可能被清理/迁移/重置，软链会断；本目录在 `~/.dsh` 用户数据区，稳定。
- **升级 DSH 后**：只用稳定的 `ctx.systemPrompt.section()` 且零依赖，一般无需改；升级后新开会话自检一次即可。
- **两层别混**：会说 = 本插件（提示词层）；会收 = 设置里「收起后显示的回复」`foldedReplies = final`（渲染层）。二者独立。

## 版本管理

本目录是一个独立 git 仓库，任何改动请 `git add -A && git commit -m "..."`，便于追溯与回滚。
