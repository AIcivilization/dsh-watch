/**
 * Active layer: the one-line system-prompt contribution that tells the agent
 * the notify tool exists and how to use it with good taste.
 *
 * The wording is product surface — it directly shapes how often and how
 * usefully the agent reaches out. Keep it to one paragraph.
 */

import type { Context } from '@deepseek-ai/cordis'

const PROMPT_TEXT =
  'You can contact the user directly: call the notify tool with a short message when something is worth their '
  + 'attention — a significant discovery, a decision they should weigh in on, or a blocker that needs their input. '
  + 'Reserve urgency "urgent" for what cannot wait; routine progress goes as "info" into the daily digest. '
  + 'Do not send trivial updates; silence is the default.'

/** Structural subset of the system-prompt/assemble waterfall arguments. */
interface PromptContextLike {
  agent?: unknown
}

/** Structural subset of the assembled prompt the waterfall passes along. */
interface AssemblyLike {
  contexts: Array<{ name: string; text: string; interpolate: boolean }>
}

type LooseAssemble = (name: string, listener: (...args: never[]) => unknown) => void

/**
 * Inject the notify-tool awareness into every assembled system prompt.
 * Mirrors the official working-directory listener: pass through next(),
 * then append (or refresh) one named context contribution.
 */
export function injectNotifyPrompt(ctx: Context): void {
  const on = ctx.on as unknown as LooseAssemble
  on('system-prompt/assemble', async (_assembly: unknown, context: PromptContextLike, next: () => Promise<AssemblyLike>) => {
    if (context.agent === undefined) return next()
    const assembly = await next()
    const contribution = assembly.contexts.find(entry => entry.name === 'dsh-watch:notify')
    if (contribution === undefined) {
      assembly.contexts.push({ name: 'dsh-watch:notify', text: PROMPT_TEXT, interpolate: false })
    } else {
      contribution.text = PROMPT_TEXT
      contribution.interpolate = false
    }
    return assembly
  })
}

export { PROMPT_TEXT }
