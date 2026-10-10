/**
 * dsh-watch — outbound watchtower for DeepSeek Harness.
 *
 * dsh keeps every event inside the process: its built-in schedule package
 * delivers reminders as in-conversation follow-ups "rather than email, SMS
 * or push notifications" (schedule README). When dsh runs on a VPS, that
 * means a three-hour task finishes silently while you are away.
 *
 * Two layers:
 * - Passive floor: listen to the agent lifecycle and push the moments that
 *   matter — turn finished, error, approval requested, agent asking you.
 * - Active voice: register a `notify` tool plus one system-prompt line so
 *   the agent itself can decide something is worth telling you mid-turn.
 *
 * It ships zero UI — the notification itself is the UI, with a deep link
 * back into the dsh web console.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, type WatchConfig } from './config.js'
import { wireAgentEvents } from './events.js'
import { WatchDispatcher } from './notify.js'
import { resolveSend } from './providers.js'
import { injectNotifyPrompt } from './prompt.js'
import { registerNotifyTool } from './tool-notify.js'

export const name = 'dsh-watch'

/** Optional cordis.yml configuration; profile defaults to `web`. */
export const inject = ['tools']

export const usage = `Outbound watchtower for dsh: pushes agent status, approvals, questions and errors to Telegram / Bark / ntfy / Slack / Discord / Lark / webhook / desktop, and gives the agent a notify tool to reach out on its own. Requires a dsh web host (>= 0.1.0-rc.6).`

export { Config }
export type { WatchConfig }

export function apply(ctx: Context, config: WatchConfig): void {
  const send = resolveSend(config)
  const dispatcher = new WatchDispatcher(ctx, config, send)
  wireAgentEvents(ctx, dispatcher, config)
  if (config.active !== false) {
    injectNotifyPrompt(ctx)
    ctx.inject(['tools'], (toolsCtx: Context) => {
      registerNotifyTool(toolsCtx, dispatcher)
    })
  }
  dispatcher.startDigest()
  ctx.effect(() => () => {
    dispatcher.dispose()
  })
  ctx.logger.info(`dsh-watch armed (provider=${config.provider}, active=${config.active !== false ? 'on' : 'off'})`)
}
