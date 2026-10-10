/**
 * dsh-watch — outbound watchtower for DeepSeek Harness.
 *
 * dsh keeps every event inside the process: its built-in schedule package
 * delivers reminders as in-conversation follow-ups "rather than email, SMS
 * or push notifications" (schedule README). When dsh runs on a VPS, that
 * means a three-hour task finishes silently while you are away.
 *
 * dsh-watch listens to the agent lifecycle and pushes the moments that
 * matter to your phone: turn finished, error, approval requested, agent
 * asking a question. It ships zero UI — the notification itself is the UI,
 * with a deep link back into the dsh web console.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, type WatchConfig } from './config.ts'
import { wireAgentEvents } from './events.ts'
import { WatchDispatcher } from './notify.ts'
import { resolveSend } from './providers.ts'

export const name = 'dsh-watch'

export const usage = `Outbound watchtower for dsh: pushes agent status, approvals, questions and errors to Telegram / Bark / ntfy / webhook. Requires a dsh web host (>= 0.1.0-rc.6).`

export { Config }
export type { WatchConfig }

export function apply(ctx: Context, config: WatchConfig): void {
  const send = resolveSend(config)
  const dispatcher = new WatchDispatcher(ctx, config, send)
  wireAgentEvents(ctx, dispatcher, config)
  ctx.logger.info(`dsh-watch armed (provider=${config.provider})`)
}
