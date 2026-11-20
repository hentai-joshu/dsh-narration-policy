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
- 调用工具前，先用一两句自然的话说明「接下来做什么、为什么」，和工具调用写在同一段里；正文和工具调用必须在同一条 assistant 消息（单独发纯文本会结束回合）。
- 一句话就够；一步里若连着几个相关动作，合并成一次说明，别拆成多条。
- 哪怕这步很简单、只调一个工具，也先用一句带过。
- 完成一个阶段、换方向、或卡住时，再补一句：结果如何、遇到什么问题、下一步怎么办。
- 不要攒到最后统一汇总；语气随意，像同事同步进度，不请示、不寒暄。`

/**
 * Register the narration section for the whole profile (all agents).
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
}
