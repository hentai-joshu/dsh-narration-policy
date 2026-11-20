/**
 * Keeps the agent narrating progress while it works (Codex-style "preamble").
 *
 * Two layers, because a prompt section alone decays in long sessions:
 * 1. Passive: one additive system-prompt section stating the requirement.
 * 2. Active: right after the context has been compacted, one short user-role
 *    reminder is appended to the step's messages. That is the moment the
 *    original instruction has just been folded away and the session restarts
 *    from a summary, so it is reviewed exactly when it is most at risk — and
 *    it costs nothing on ordinary turns.
 *
 * Design constraints:
 * - additive only: never replaces prompt sections, messages or decisions;
 * - must never break a step: every failure is caught and the decision passes
 *   through unchanged;
 * - no runtime dependencies besides `node:crypto` (message identity);
 * - top-level agents only: subagent narration is not user-visible;
 * - quiet by default: it speaks only when a compaction checkpoint shows up in
 *   the step's claimed messages (source.kind === 'compact-checkpoint').
 */

import { randomUUID } from 'node:crypto'

/** Cordis plugin name. */
export const name = 'narration-policy'

/** Only activate where the prompt registry exists (practices.md). */
export const inject = ['systemPrompt']

/** Master switch for the active post-compaction layer. */
export const REVIEW_ENABLED = true

/** Marker DSH puts on the user message that replaces a compacted range. */
export const COMPACT_CHECKPOINT_KIND = 'compact-checkpoint'

/** Passive layer: the prompt section. Keep the wording in one place. */
export const NARRATION_TEXT = `## 过程汇报（Preamble）
### 每条消息都要有人话
- 发出工具调用前，检查这条消息里有没有一句给人看的中文说明；没有就是不合格，补上再调用。
- 说明只要一两句：接下来做什么、为什么；工具结果回来后，补一句看到了什么、接着怎么办。
- 这条贯穿整个会话：长对话、上下文被压缩之后、连续多步操作时同样适用。不要出现一连串只有工具调用、一个字都没有的回合。
### 该说和不该说
- 同一步里连着几个相关动作，开头一句就够。哪怕只调一个工具，也先用一句带过。
- 完成一个阶段、换方向或卡住时，单独再说一句：结果如何、遇到什么问题、下一步怎么办。
- 不写"现在我来看看""让我检查一下"这类空话，也不为还没做的事提前汇报。
- 不要攒到最后统一汇总；不请示、不寒暄、不复述这段对话本身。
### 回答本身
- 结论先说，依据在后；一句话能答完的不铺开。
- 有多个方案时给出推荐项和理由，而不是只罗列让人自己选。
- 不确定的地方直说不确定，不要用模糊表述掩盖。`

/** Active layer: the reminder appended right after a compaction checkpoint. */
export const REVIEW_TEXT = `## 过程汇报提醒（上下文刚压缩过）
压缩之后重新对一下输出方式：接下来每次调用工具之前，先用一两句中文说明要做什么、为什么这样做；工具结果回来后，补一句看到了什么、接着怎么办。不要出现只有工具调用、没有一个字的回合。`

/**
 * True for a top-level agent; subagent sessions are marked in their meta.
 * @param session - the agent's session.
 * @returns whether narration policy should apply.
 */
function isTopLevel(session) {
  const meta = session?.meta
  if (meta === undefined || meta === null) return true
  if (meta.origin === 'subagent') return false
  return !(typeof meta.delegationDepth === 'number' && meta.delegationDepth > 0)
}

/**
 * Whether one claimed message is the checkpoint written when a range was
 * compacted. DSH brands it `source.kind === 'compact-checkpoint'`.
 * @param message - one entry of the step's claimed messages.
 * @returns whether it is a compaction checkpoint.
 */
function isCompactionCheckpoint(message) {
  if (message === null || typeof message !== 'object') return false
  const source = message.source
  if (source === null || typeof source !== 'object') return false
  return source.kind === COMPACT_CHECKPOINT_KIND
}

/**
 * Build one immutable user-role notice message.
 * @param text - the notice body.
 * @returns a frozen message the driver can enter like any other user message.
 */
function noticeMessage(text) {
  const content = Object.freeze([Object.freeze({ type: 'text', text })])
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content,
    source: Object.freeze({ kind: 'narration-policy', form: 'notice' }),
  })
}

/**
 * Register the narration section (all agents) and the post-compaction review.
 * @param ctx - Cordis context that provides `systemPrompt`.
 */
export function apply(ctx) {
  try {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: 'narration-policy',
        order: 9000,
        text: NARRATION_TEXT,
      }),
      'narration-policy.section()',
    )
  } catch (err) {
    // A prompt-section failure must never prevent a session from starting.
    console.warn('[narration-policy] failed to register prompt section:', err)
  }

  try {
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      try {
        if (!REVIEW_ENABLED) return decision
        if (decision?.kind !== 'enter') return decision
        if (payload?.signal?.aborted === true) return decision

        const session = payload?.agent?.session
        if (session === undefined) return decision
        if (!isTopLevel(session)) return decision

        const messages = Array.isArray(decision.messages) ? decision.messages : []
        if (!messages.some(isCompactionCheckpoint)) return decision

        return { ...decision, messages: [...messages, noticeMessage(REVIEW_TEXT)] }
      } catch (err) {
        console.warn('[narration-policy] post-compaction review failed:', err)
        return decision
      }
    })
  } catch (err) {
    console.warn('[narration-policy] failed to register pre-step listener:', err)
  }
}
