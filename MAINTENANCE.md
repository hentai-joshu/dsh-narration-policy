# 维护说明（v1.5.0）

## 结构

- `index.js`：唯一实现。`inject = ['systemPrompt']`；导出 `name = 'narration-policy'`。
- `apply(ctx)` 只做三件事：
  1. `ctx.effect(() => ctx.systemPrompt.section({ name: 'narration-policy', order: 9000, text: NARRATION_TEXT }))`
  2. `ctx.on('session/event', (session, event) => …)` 维护 `WeakMap<Session, { silentSteps }>`
  3. `ctx.on('tools/post-execute', …)`（默认）或 `ctx.on('tools/pre-execute', …)`（deny 模式）

## 关键不变量（改代码时别破坏）

1. **系统提示文案逐字节恒定**：不能含时间、轮数、sessionId、随机数、`{{变量}}`。否则前缀缓存整段失效。
2. **提醒必须带 `source`**：`{ kind: 'narration-policy', form: 'notice', summary: <非空字符串> }`。带标记才不会渲染成用户气泡；`form: 'notice'` 且 `summary` 非空才不会落到 `OpaqueBody`。
3. **不要用 `deny` 做默认**：框架会把 deny 渲染成 `Error: …`（`dsh-tools/lib/types/pipeline.js`），用户明确不想看到。
4. **计数按思考块**：有 `reasoning` 且无非空 `text` 就 +1，不看有没有 `tool-call`（用户 m01274 要求按思考计数，m01845 明确「不用看工具调用」）。
5. **频率三重闸门**：`reasoningSteps`（连续几步沉默）× `maxPerTurn`（每回合上限）× `minTurnsBetweenReminders`（跨回合最小间隔，`turnIndex - lastReminderTurnIndex` 判定）。提醒会落库成 `user/message`，长会话里累积占上下文，所以第三道闸门是控制长期污染的关键（v1.5.2）。

7. **v1.5.7**：计数条件从 `hasReasoning && hasToolCall` 改为只看 `hasReasoning`（修掉「有工具调用但没思考块」或「有思考没工具」时的漏计/误计）；单测 15/15。
8. **v1.5.8**：新增 `agent/pre-step` 触发通道（覆盖纯思考、不调工具的步），提醒逻辑抽成 `takeReminder(counter, config)` 供 pre-step / post-execute / pre-execute 共用，保证不重复；pre-step 里先做回合对账（`payload.turn !== counter.turn` 就重置计数器）。单测 19/19。
9. **v1.5.6**：`maxPerTurn: 0` = 不封顶（每 `reasoningSteps` 步沉默提醒一次，长回合持续纠偏）；不影响默认值 1。
5. **同版本号重装不重载**：改完必须升 `version` 再 `remove_bundle` → `install_bundle`。

## 本地验证

```bash
node /tmp/exp/test-v15.mjs        # 25 个用例：section/计数/阈值/子代理/notice 形状/deny 模式/配置热读
node --check index.js
```

真机验证：装好后连续 3 步只思考不写字（每步夹一个工具调用），查看会话日志里是否出现 `source.kind = 'narration-policy'` 的 `user/message`，且**没有**任何 `Error:`。

## 回滚

`~/.dsh/narration-policy.json` 写 `{ "reminder": false }` 即只保留静态提示（零额外注入）；或 `{ "mode": "deny" }` 回到强约束；彻底回退用 `plugin_manager remove_bundle`。

6. **v1.5.5（独立压测反馈修复）**：①`turnsGateOpen` 同回合直接放行，`maxPerTurn>1` 不再是死配置；②`getConfig` 校验 `mode` 只认 `context|deny`，拼错回落默认（否则两个监听都会提前 return，提醒静默失效）；③JSON 解析失败时也缓存 mtime，避免每次调用都 `statSync+readFileSync+parse`（10 万次从 17.7µs/次降到 2.2µs/次）；④数值字段统一用 `Number()` 归一，`"5"`/`2.7` 不再被静默丢弃。
