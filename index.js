/**
 * narration-policy — 让助手在长对话里也保持「干活时顺口说一句」。
 *
 * 两层：
 *  1) 静态：向系统提示追加一段输出约定（逐字节恒定，不破坏前缀缓存）。
 *  2) 提醒：连续若干步「只在思考、正文一个字都没有」后，在该步工具执行完、
 *     下一步开始前，塞一条带 source 标记的上下文消息（不会被渲染成用户气泡，
 *     也不会像 deny 那样显示成 Error:）。
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'narration-policy'
export const inject = ['systemPrompt']

const SECTION_NAME = 'narration-policy'
const SECTION_ORDER = 9000

const NARRATION_TEXT = `## 过程汇报（Preamble）

### 每条消息都要有人话

- 发出工具调用前，检查这条消息里有没有一句给人看的中文说明；没有就是不合格，补上再调用。
- 说明只要一两句：接下来做什么、为什么；工具结果回来后，补一句看到了什么、接着怎么办。
- 这条贯穿整个会话：长对话、上下文被压缩之后、连续多步操作时同样适用。不要出现一连串只有工具调用、一个字都没有的回合。

### 该说和不该说

- 同一步里连着几个相关动作，开头一句就够，不必逐个解释。
- 完成一个阶段、换方向或卡住时，单独再说一句：结果如何、遇到什么问题、下一步怎么办。
- 不写"现在我来看看""让我检查一下"这类空话，也不为还没做的事提前汇报。
- 不要攒到最后统一汇总；不请示、不寒暄、不复述这段对话本身。

### 回答本身

- 结论先说，依据在后；一句话能答完的不铺开。
- 有多个方案时给出推荐项和理由，而不是只罗列让人自己选。
- 不确定的地方直说不确定，不要用模糊表述掩盖。

### 压缩后重新对一遍

- 如果对话里出现「This is an automatically generated checkpoint」或「compacted-summary」这类标记，说明前面一段历史刚被压缩成摘要、早期示范已不在上下文里。看到它就把上面几条重新执行一遍：下一条消息先写一两句说明，再调工具。`

const CONFIG_PATH = process.env.DSH_NARRATION_CONFIG ?? join(homedir(), '.dsh', 'narration-policy.json')

const DEFAULTS = {
  // 连续多少步「只有思考、没有正文」后提醒一次（一步 = 一条 assistant 消息）
  reasoningSteps: 3,
  // 同一个回合里最多提醒几次（默认 1 次，避免长回合反复占上下文）；设 0 表示不限制
  maxPerTurn: 1,
  // 两次提醒之间至少隔几个回合（默认 3；提醒会留在历史里，bili 压缩前一直占上下文）
  minTurnsBetweenReminders: 3,
  // 'context' = 不打断工具，只在下一步注入一条提醒（默认，无 Error）
  // 'deny'    = 直接拒绝工具调用（会显示成 Error:，仅在需要强约束时打开）
  mode: 'context',
  reminder: true,
}

let configCache = { mtime: -1, value: DEFAULTS }

function toInt(value, fallback, min) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return fallback
  return Math.floor(n)
}

function getConfig() {
  let mtime
  try {
    mtime = statSync(CONFIG_PATH).mtimeMs
  } catch {
    // 文件不存在：回落到默认值
    configCache = { mtime: -1, value: DEFAULTS }
  }
  if (mtime !== undefined && mtime !== configCache.mtime) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
      configCache = { mtime, value: { ...DEFAULTS, ...parsed } }
    } catch {
      // JSON 非法：也记住这个 mtime，避免每次调用都重读重解析
      configCache = { mtime, value: DEFAULTS }
    }
  }
  const value = { ...configCache.value }
  value.reasoningSteps = toInt(value.reasoningSteps, DEFAULTS.reasoningSteps, 1)
  value.maxPerTurn = toInt(value.maxPerTurn, DEFAULTS.maxPerTurn, 0)
  value.minTurnsBetweenReminders = toInt(value.minTurnsBetweenReminders, DEFAULTS.minTurnsBetweenReminders, 1)
  if (value.mode !== 'context' && value.mode !== 'deny') value.mode = DEFAULTS.mode
  if (typeof value.reminder !== 'boolean') value.reminder = DEFAULTS.reminder
  const envSteps = Number(process.env.DSH_NARRATION_REASONING_STEPS)
  if (Number.isFinite(envSteps) && envSteps > 0) value.reasoningSteps = Math.floor(envSteps)
  if (process.env.DSH_NARRATION_REMINDER === '0') value.reminder = false
  return value
}

/* ---------- 会话计数 ---------- */

const counters = new WeakMap()

function counterOf(session) {
  let counter = counters.get(session)
  if (counter === undefined) {
    counter = { silentSteps: 0, turn: undefined, reminders: 0, turnIndex: 0, lastReminderTurnIndex: null }
    counters.set(session, counter)
  }
  return counter
}

function sessionOf(agent) {
  return agent?.session ?? agent
}

// 两次提醒之间至少隔 minTurnsBetweenReminders 个回合（提醒会留在历史里占上下文）
function turnsGateOpen(counter, config) {
  if (counter.lastReminderTurnIndex === null) return true
  // 同一回合内由 maxPerTurn 管，不再受跨回合最小间隔限制
  if (counter.turnIndex === counter.lastReminderTurnIndex) return true
  return counter.turnIndex - counter.lastReminderTurnIndex >= config.minTurnsBetweenReminders
}

function isTopLevel(session) {
  const meta = session?.meta
  if (meta === undefined) return true
  if (meta.origin === 'subagent') return false
  if (typeof meta.delegationDepth === 'number' && meta.delegationDepth > 0) return false
  return true
}

// 共享判断：够不够格提醒。够格就「消费」这次额度并返回当时的沉默步数，否则返回 null。
// 这样 pre-step / post-execute / pre-execute 三个钩子不会重复提醒。
function takeReminder(counter, config) {
  if (counter.silentSteps < config.reasoningSteps) return null
  if (config.maxPerTurn > 0 && counter.reminders >= config.maxPerTurn) return null
  if (!turnsGateOpen(counter, config)) return null
  const steps = counter.silentSteps
  counter.silentSteps = 0
  counter.reminders += 1
  counter.lastReminderTurnIndex = counter.turnIndex
  return steps
}

function blocksOf(message) {
  const content = message?.content
  return Array.isArray(content) ? content : []
}

function hasText(blocks) {
  return blocks.some((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '')
}

function hasReasoning(blocks) {
  return blocks.some((block) => block?.type === 'reasoning' && typeof block.text === 'string' && block.text.trim() !== '')
}

function hasToolCall(blocks) {
  return blocks.some((block) => block?.type === 'tool-call')
}

/* ---------- 提醒消息 ---------- */

function nudgeText(steps) {
  return `过程汇报提醒：你已连续 ${steps} 步只思考、没有留下文字。`
    + '请先用一两句中文说明接下来要做什么、为什么，把说明和这次工具调用写在同一条消息里。'
    + '之后也请继续保持：本回合剩下的步骤、以及后面几个回合，别长时间只有工具调用、没有一句人话；什么时候该说，你自己判断。'
}

function noticeMessage(steps) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: nudgeText(steps) }],
    source: Object.freeze({ kind: SECTION_NAME, form: 'notice', summary: '过程汇报提醒' }),
  }
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: NARRATION_TEXT }),
    'narration-policy.section()',
  )

  ctx.on('session/event', (session, event) => {
    try {
      if (!isTopLevel(session)) return
      if (event?.type !== 'assistant/message') return
      const blocks = blocksOf(event.data?.message)
      if (blocks.length === 0) return
      const counter = counterOf(session)
      if (event.data?.turn !== counter.turn) {
        counter.turn = event.data?.turn
        counter.turnIndex += 1
        counter.silentSteps = 0
        counter.reminders = 0
      }
      if (hasText(blocks)) {
        counter.silentSteps = 0
        return
      }
      // 按「思考块」计数：只要这一步有思考、又没有留下文字，就算一次沉默。
      // 工具调用参与与否不影响计数（用户 m01845 的要求）。
      if (hasReasoning(blocks)) counter.silentSteps += 1
    } catch (error) {
      console.warn('[narration-policy] session/event failed:', error)
    }
  })

  // 强约束模式：直接拒绝（会显示成 Error:，默认不开启）
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    try {
      const config = getConfig()
      if (!config.reminder || config.mode !== 'deny') return decision
      if (decision?.kind !== 'allow') return decision
      const session = sessionOf(exec?.agent)
      if (session === undefined || !isTopLevel(session)) return decision
      const counter = counterOf(session)
      const steps = takeReminder(counter, config)
      if (steps === null) return decision
      return { kind: 'deny', reason: nudgeText(steps), info: { name: 'NarrationRequired', code: 'NARRATION_REQUIRED' } }
    } catch (error) {
      console.warn('[narration-policy] pre-execute failed:', error)
      return decision
    }
  })

  // 默认模式：不打断任何工具，只把提醒挂到下一步的 inbox
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const downstream = await next()
    try {
      const config = getConfig()
      if (!config.reminder || config.mode !== 'context') return downstream
      const session = sessionOf(exec?.agent)
      if (session === undefined || !isTopLevel(session)) return downstream
      const counter = counterOf(session)
      const steps = takeReminder(counter, config)
      if (steps === null) return downstream
      return { ...downstream, additionalContexts: [noticeMessage(steps), ...(downstream?.additionalContexts ?? [])] }
    } catch (error) {
      console.warn('[narration-policy] post-execute failed:', error)
      return downstream
    }
  })

  // 补充通道：每步请求开始前也检查一次。
  // 「只在思考里想、不调工具」的步没有 post-execute，只有这里能照到。
  // 三个钩子共用 takeReminder，先到先得，不会重复提醒。
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      const config = getConfig()
      if (!config.reminder || config.mode !== 'context') return decision
      if (decision?.kind !== 'enter') return decision
      const session = sessionOf(payload?.agent)
      if (session === undefined || !isTopLevel(session)) return decision
      const counter = counterOf(session)
      // pre-step 比 session/event 更早看到新回合，这里先把回合对账做掉，
      // 免得把上一回合的沉默算到新回合头上。
      const turn = payload?.turn
      if (turn !== undefined && turn !== counter.turn) {
        counter.turn = turn
        counter.turnIndex += 1
        counter.silentSteps = 0
        counter.reminders = 0
      }
      const steps = takeReminder(counter, config)
      if (steps === null) return decision
      const messages = Array.isArray(decision.messages) ? decision.messages : []
      return { ...decision, messages: [...messages, noticeMessage(steps)] }
    } catch (error) {
      console.warn('[narration-policy] pre-step failed:', error)
      return decision
    }
  })
}
