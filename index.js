/**
 * Adds one additive system-prompt section that asks the agent to narrate
 * progress while it works (Codex-style "preamble" messages).
 *
 * Design constraints:
 * - additive only: never replaces or shadows any other prompt section;
 * - no I/O, no network, no timers: the only side effect is registering text;
 * - unique section name, so it cannot collide with built-in persona/tool sections;
 * - zero runtime imports, so it survives DSH internal refactors;
 * - registration is owned by a ctx.effect, so unloading/upgrading removes it.
 */

/** Cordis plugin name. */
export const name = 'narration-policy'

/** Only activate where the prompt registry exists (practices.md). */
export const inject = ['systemPrompt']

/** Keep the wording in one place so it is easy to edit. */
export const NARRATION_TEXT = `## 过程汇报（Preamble）
- 每次调用工具前，先用 1–2 句话说明「接下来做什么、为什么」，再发这次工具调用；这句说明必须和工具调用写在同一条 assistant 消息里（单独发纯文本会结束回合）。
- 每完成一个子目标、改变方案、遇到错误或阻塞时，用 1–3 句白话补充：刚做完什么、结果如何、遇到什么问题、打算怎么解决。
- 不要攒到最后统一总结；语气平实，像同事在边上同步进度。`

/**
 * Register the narration section for the whole profile (all agents).
 * @param ctx - Cordis context that provides `systemPrompt`.
 */
export function apply(ctx) {
  try {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: 'narration-policy',
        order: 5000,
        text: NARRATION_TEXT,
      }),
      'narration-policy.section()',
    )
  } catch (err) {
    // A prompt-section failure must never prevent a session from starting.
    console.warn('[narration-policy] failed to register prompt section:', err)
  }
}
