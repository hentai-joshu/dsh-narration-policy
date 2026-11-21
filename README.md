# dsh-narration-policy

让 DeepSeek Harness 的 agent 边干边说：每次调用工具前，先用一两句中文讲「在做什么、为什么」，工具结果回来后补一句进展，而不是只在开头计划和结尾总结。

它只做一件事：往系统提示里加一段话。**不注入任何消息**，所以对话记录里不会冒出多余的气泡。

## 为什么只用一段提示

早期版本试过「每步纠偏」——上一条回复只调工具不写字时插一条提醒。实测太吵，且那条提醒只能以 **user 消息**的形式塞进对话，用户会看到一条自己没说过的话，不合理。

现在改成纯提示：系统提示里除了写要求，还写了一条**条件规则**——DSH 每次压缩上下文都会写下一条以 `This is an automatically generated checkpoint…` 开头的摘要，模型看到这个标记就知道「刚才压缩过、早期示范被折掉了」，自己按规则重新执行一遍。既不需要额外机制，也不污染对话。

## 内容

`NARRATION_TEXT`（`index.js`）分四小节：

- **每条消息都要有人话**：调工具前先写一两句说明；长对话、压缩后、连续多步同样适用。
- **该说和不该说**：同一步多个动作开头一句带过；阶段完成/换方向/卡住时补一句；不写空话、不攒到最后。
- **回答本身**：结论先说；多方案给推荐项和理由；不确定直说。
- **压缩后重新对一遍**：看到 `automatically generated checkpoint`、`<compacted-summary>`，或以 `[Compressed conversation section]` 开头的消息块（外部代理压缩的形态），就把上面几条重新执行。

## 它做什么 / 不做什么

- 只追加一个 system-prompt section（名字 `narration-policy`，order `9000`）；不覆盖、不替换任何现有说明，也不改动任何消息或决策。
- 不追加消息、不做文件/网络/定时器操作，运行时零依赖。
- 注册挂在 `ctx.effect()` 上，卸载/升级自动注销；失败只 `console.warn`，不影响会话。

## 成本

每次请求多约 350–400 tokens（这段文字本身）。没有别的开销。

## 配置

改 `index.js` 顶部的 `NARRATION_TEXT`，改完重装生效。

## 安装

```
plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy
```

装完新建会话生效（已有会话沿用启动时的版本）。

## 卸载

在 **Plugins** 里移除该 bundle，或去掉 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 条目。

## 与其他机制的关系

- 与 `@deepseek-ai/dsh-agent-instructions`（DSH 自带、从 `AGENTS.md` 注入）是两种独立实现：那个靠文件，这个自带文案。两者都在会重复，建议只留一个。
- 与设置里的「收起后显示的回复」(`foldedReplies`) 无关：那是渲染层，只管中间文字收不收起。

## 维护 / 回滚 / 排错

见同目录 `MAINTENANCE.md`。版本见 tag 与 `package.json`。

## 许可证

MIT，见同目录 `LICENSE`。
