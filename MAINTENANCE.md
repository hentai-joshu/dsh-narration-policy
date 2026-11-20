# 维护手册（MAINTENANCE）

> 位置：`~/.dsh/local-plugins/dsh-narration-policy`（独立于工作区，profile 通过软链引用，清理工作区不会断）。

## 它是什么

给 DeepSeek Harness 全局加两层「过程汇报」约束，文案自带、不依赖 `AGENTS.md`：

1. **被动层**：一段追加的 system-prompt section（`narration-policy`，order `9000`）。
2. **主动层**：`agent/pre-step` 监听。当这一步领到的 `messages` 里出现 `source.kind === 'compact-checkpoint'`（刚压缩过）时，往 `decision.messages` 末尾追加一条 user 角色复习提醒（`source.kind = 'narration-policy'`, `form: 'notice'`），只对顶层 agent 生效。

为什么是压缩后提醒：系统提示那段是常量，会话越长占比越小；而**压缩**正是早期「先说明再调工具」示范被折进摘要的时刻。v1.1 曾做「每步纠偏」，实测过于频繁，v1.2 起改为压缩后一次。

## 目录结构

- `index.js` —— 全部逻辑 + 文案常量 `NARRATION_TEXT` / `REVIEW_TEXT` + `REVIEW_ENABLED` / `COMPACT_CHECKPOINT_KIND`
- `package.json` —— `name: @local/dsh-narration-policy`, `version: 1.2.1`
- `cordis.patch.yml` —— 把插件挂到 profile loader 的一行
- `README.md` —— 给使用者看的概述
- `MAINTENANCE.md` —— 本文件（维护/回滚/排错）

## 改文案（最常做的操作）

1. 改 `index.js` 的 `NARRATION_TEXT`（被动）或 `REVIEW_TEXT`（压缩后提醒），逻辑别动。
2. 重装：
   `plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy`
3. 验证被动层：读会话日志 `~/.dsh/sessions/<cwd>/session-*/session.v4.jsonl.zstd` 最近的 `system/message` 事件，含新文案即生效。
4. `git commit`，必要时 `git tag v1.2.x && git push`。

## 安装 / 卸载

- 安装：见 `README.md`。
- 卸载：`plugin_manager action=remove_bundle target=@local/dsh-narration-policy`，再从 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 去掉条目。

## 验证清单

1. `~/.dsh/profiles/desktop/package.json` 依赖行 = `"@local/dsh-narration-policy": "link:/Users/maliyang/.dsh/local-plugins/dsh-narration-policy"`，且 `dsh.profile.bundles` 有该条目。
2. `plugin_manager install_bundle` 返回 `application: "applied"` 且 `version: 1.2.1`。
3. 被动层：会话日志 `system/message` 含 `## 过程汇报（Preamble）` 与「没有就是不合格」。
4. 主动层：单测脚本模拟 `agent/pre-step`（假 ctx + 假 decision）覆盖 5 种情况——有检查点→追加；无检查点/空消息/reject/子代理/abort→原样返回。

## 回滚

- 关主动层：`REVIEW_ENABLED = false`，重装。
- 整体：移除 bundle，恢复「无此段」。
- 想回到「每步纠偏」：在 git 历史里找 v1.1.0 的 `index.js`。

## 排错 / 坑

- **bundles 被清空**：插件管理器重写 profile `package.json` 时偶有把 `bundles` 条目清掉的先例；装/卸别的插件后 `grep @local/dsh-narration-policy ~/.dsh/profiles/desktop/package.json` 确认还在。
- **别再挪回工作区**：工作区可能被清理/迁移，软链会断；`~/.dsh` 用户数据区才稳。
- **主动层没触发**：只有 DSH 自身压缩（`dsh-compaction-basic`，dsh-base 自带）跑过才会有检查点；`agent/pre-step` payload 必须带 `agent.session`。若 DSH 升级改了 `source.kind` 常量，改 `COMPACT_CHECKPOINT_KIND`。
- **升级 DSH 后**：只用了 `ctx.systemPrompt.section()` 与 `ctx.on('agent/pre-step')` 两个稳定扩展点；改名时 `index.js` 只 warn 不崩，被动层仍在。
- **提醒显示形态**：`source.form = 'notice'`；前端目前不按 `source` 区分渲染，会显示成一条普通 user 消息。压缩后只出现一次，可接受；若嫌碍眼，可在前端按 `source.kind` 过滤。

## 版本管理

独立 git 仓库，改动请 `git add -A && git commit`。远端：`github.com/hentai-joshu/dsh-narration-policy`。
