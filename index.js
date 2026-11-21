/**
 * Keeps the agent narrating progress while it works (Codex-style "preamble").
 *
 * Single layer: one additive system-prompt section. It states the requirement
 * and, crucially, tells the model how to notice that the context has just been
 * compacted (DSH writes a checkpoint message that begins with
 * "This is an automatically generated checkpoint…"), so the model re-applies
 * the requirement on its own. Nothing is injected into the conversation, so no
 * fake user message ever shows up in the transcript.
 *
 * Design constraints:
 * - additive only: never replaces prompt sections or messages;
 * - no messages are ever appended; the only output is this prompt section;
 * - registered with `interpolate: false`: the text is a constant, never a template;
 * - must never break a session: registration failures are caught and warned;
 * - no runtime dependencies.
 */

/** Cordis plugin name. */
export const name = 'narration-policy'

/** Only activate where the prompt registry exists. */
export const inject = ['systemPrompt']

/** The prompt section. Keep the wording in one place. */
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
- 不确定的地方直说不确定，不要用模糊表述掩盖。
### 压缩后重新对一遍
- 如果对话里出现「This is an automatically generated checkpoint」或 <compacted-summary>，说明前面一段历史刚被压缩成摘要、早期「先说一句再调工具」的示范已经不在上下文里了。看到它就立刻把上面几条重新执行一遍：下一条消息先写一两句说明，再调工具。`

/**
 * Register the narration section. This is the plugin's only effect.
 * @param ctx - Cordis context that provides `systemPrompt`.
 */
export function apply(ctx) {
  try {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: 'narration-policy',
        order: 9000,
        text: NARRATION_TEXT,
        interpolate: false,
      }),
      'narration-policy.section()',
    )
  } catch (err) {
    // A prompt-section failure must never prevent a session from starting.
    console.warn('[narration-policy] failed to register prompt section:', err)
  }
}
