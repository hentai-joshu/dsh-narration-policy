# dsh-narration-policy

让 DeepSeek Harness 的 agent 边干边说：调工具前先用一两句中文讲「在做什么、为什么」，结果回来补一句进展，而不是只在开头计划和结尾总结。

## 两层，都只做加法

1. **静态提示层**（常开）：往系统提示追加 `## 过程汇报（Preamble）`，order `9000`，逐字节恒定 —— 不随时间、轮数、思考语言变化，前缀缓存不受影响。
2. **沉默提醒**（默认开，可关）：连续 `reasoningSteps` 步「只有思考（reasoning）、正文一个字都没有」后，把一条提醒作为 **context 消息** 放进下一步的输入。两个触发点：工具执行完（`tools/post-execute`）、以及每步请求开始前（`agent/pre-step`，覆盖「只在思考、不调工具」的步）。两者共用同一个额度，先到先得，不会重复。

提醒消息带 `source: { kind: 'narration-policy', form: 'notice', summary: '过程汇报提醒' }`，因此：

- 前端按 `notice` 渲染成一条附加内容，**不会变成用户气泡**（`user/message` 且 `source.kind !== 'user'` 一律按上下文处理）；
- 走 `tools/post-execute` 的 `additionalContexts`，**不打断工具、不产生 `Error:`**；
- 只是往对话尾部追加，不改系统提示前缀，缓存不受影响。
- 文案不只管「这一次」：会要求「本回合剩下的步骤、以及后面几个回合，别长时间只有工具调用、没有一句人话」，但不规定「每次都写」——什么时候该说由模型自己判断。因为这条提醒会留在历史里，正好在后续回合继续起作用。

如果确实需要强约束，可切到 `mode: "deny"`：在 `tools/pre-execute` 直接拒绝工具调用（理由模型可见）。代价是框架会给它加上 `Error:` 前缀并显示在工具卡片上。

## 配置

可选文件 `~/.dsh/narration-policy.json`：

```json
{ "reasoningSteps": 5, "maxPerTurn": 1, "minTurnsBetweenReminders": 3, "mode": "context", "reminder": true }
```

- `reasoningSteps`：连续多少步「只思考不写字」提醒一次，默认 `3`。
- `maxPerTurn`：同一个回合里最多提醒几次，默认 `1`（长回合不会反复往上下文里加东西）；设为 `0` 表示不限制，只要还在连续沉默就每隔 `reasoningSteps` 步再提醒一次。
- `minTurnsBetweenReminders`：两次提醒之间至少隔几个回合，默认 `3`；设为 `1` 即等于取消跨回合限制（每回合都可提醒一次）。提醒会作为 `user/message` 留在历史里、后续每个回合都带着，所以用它控制长期累积（bili 压缩后会消失）。
- `mode`：`context`（默认，注入提醒，无报错）/ `deny`（拒绝工具调用，会显示 Error）。
- `reminder`：`false` 只保留静态提示，不做任何提醒。

环境变量优先：`DSH_NARRATION_REASONING_STEPS`、`DSH_NARRATION_REMINDER=0`。另可用 `DSH_NARRATION_CONFIG` 指定配置文件路径（测试用）。
配置文件按 mtime 自动重读，**改完即生效，不用重装**；删掉配置文件立即回落到默认值。

## 计数口径

- **一步 = 一条 assistant 消息**。
- 「说了话」= 消息里有非空 `text` 块；`reasoning`（思考）**不算**说话。
- 只要这条消息里**有 reasoning 思考块、又没有非空 text**，就让计数 +1；工具调用有没有都不影响（v1.5.7）。任何一条带 text 的消息把计数清零。
- 子代理（`session.meta.origin === 'subagent'` 或 `delegationDepth > 0`）不参与。

## 它做什么 / 不做什么

- 追加一个 system-prompt section（`narration-policy`，order `9000`）；不覆盖、不替换任何现有说明。
- 挂 `tools/post-execute`（默认模式）或 `tools/pre-execute`（deny 模式），只在阈值达标时动作，其余一律透传。
- 只对顶层 agent 生效；不写文件、不联网、无定时器，运行时只依赖 `node:*`。
- 所有监听 try/catch 只 `console.warn`，异常时按放行处理，不影响会话。

## 成本

- 静态提示：每次请求多约 350–400 tokens。
- 提醒：每条约 60 tokens，追加在对话末尾（前缀缓存不受影响）；默认 3 步一次、每回合最多 1 条。

## 安装

放进 profile 的 `node_modules`（或本仓库的 `link:` 依赖）并在 profile `package.json` 的 `dsh.profile.bundles` 里加 `@local/dsh-narration-policy`，重启 DSH 生效；之后改代码用 plugin_manager 卸载再装即可热更新（**同版本号重装不会重载**，要改版本号）。

## 卸载

从 `dsh.profile.bundles` 去掉并重启，或用 `plugin_manager remove_bundle`。
