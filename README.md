# dsh-narration-policy

让 DeepSeek Harness 的 agent 像 Codex 那样边干边说：每次调用工具前，先用一两句话同步「在做什么、为什么」，工具结果回来后补一句进展，而不是只在开头计划、结尾总结。

一句话理由：**只在系统提示里写一条要求，长会话里会衰减**。这个插件用两层兜住它，且**文案完全自带**，不依赖任何 `AGENTS.md` 文件。

## 两层设计

| 层 | 机制 | 作用 |
|---|---|---|
| 被动 | system-prompt section `narration-policy`（order `9000`） | 每次请求都带上这条要求 |
| 主动 | `agent/pre-step` 监听，检测到压缩检查点后追加一条 user 角色提醒 | 上下文刚被压缩、早期示范被折进摘要时，立刻把要求复习一遍 |

主动层为什么这样触发：上下文越长，系统提示那一段占比越小；**压缩**是要求最容易失效的时刻——早期那些「先说明再调工具」的示范轮次被折进摘要，不压缩时靠提示段就够。DSH 的压缩器会把被压缩的历史替换成一条带 `source.kind = 'compact-checkpoint'` 的检查点消息，插件就在这一步之后补一条复习提醒。

> 历史：v1.1 曾经做过「每一步都纠偏」的版本，实测过于频繁、打扰对话，v1.2 改为只在压缩后提醒一次。

## 它做什么 / 不做什么

- **只追加**：一个 system-prompt section，以及压缩后的一条 user 提醒；不覆盖、不替换任何现有 persona / 工具说明 / 环境段，也不改动 pre-step 的决策（只往 `messages` 末尾追加）。
- 不做文件、网络、定时器、进程操作；运行时依赖只有 `node:crypto`（给消息生成身份）。
- 注册挂在 `ctx.effect()` / `ctx.on()` 上，插件卸载/升级时自动注销。
- 任何异常都只 `console.warn` 并放行，**不会阻断会话或某一步**。

## 主动层的边界

- 触发条件：这一步领到的 `messages` 里存在 `source.kind === 'compact-checkpoint'` 的消息（即刚压缩过）。
- 只对**顶层 agent** 生效；子代理（`session.meta.origin === 'subagent'` 或 `delegationDepth > 0`）不插提醒。
- 提醒消息的 `source` 是 `{ kind: 'narration-policy', form: 'notice' }`，与用户真实发言区分。

## 生效范围

profile 级：装进 `desktop`（或当前 profile）后，**所有会话**都会带被动层；主动层只作用于顶层 agent。

## 成本

- 被动层：每次请求多约 150–200 tokens。
- 主动层：每次压缩后一条提醒，约 90 tokens；不压缩就没有额外开销。

## 配置

改 `index.js` 顶部常量即可，改完重装生效：

- `REVIEW_ENABLED = false` —— 关掉主动层，只保留系统提示（等价 v1.0）。
- `NARRATION_TEXT` / `REVIEW_TEXT` —— 两层的文案。
- `COMPACT_CHECKPOINT_KIND` —— 压缩检查点的 `source.kind`（默认 `compact-checkpoint`，DSH 内部常量）。

## 安装

用 DSH 的插件管理器安装本目录（绝对路径）：

```
plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy
```

或在 Desktop 的 **Plugins → Add plugin** 选择本目录。装完**新建会话**验证（已有会话保持它启动时的插件版本）。

## 更新

本插件从 GitHub 目录安装（非 npm registry），没有自动更新提示，更新需手动：拉取最新代码 → 重装 bundle → 新建会话验证。版本见仓库 tag 与 `package.json` 的 `version`。

## 卸载

在 **Plugins** 里把这个 bundle 移除，或在 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 去掉条目并重装/重启。

## 与其他机制的关系

- 与 `@deepseek-ai/dsh-agent-instructions`（DSH 自带的 `AGENTS.md` 注入）是**两种独立实现**：那个靠文件、这个自带文案。若两者都在，内容会重复，建议只留一个。
- 与设置里「收起后显示的回复」(`foldedReplies`) 无关：那个是渲染层，只影响中间文字是否收起。

## 维护 / 回滚 / 排错

见同目录 `MAINTENANCE.md`。

## 许可证

MIT，见同目录 `LICENSE`。
