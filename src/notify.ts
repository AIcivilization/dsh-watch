/**
 * WatchDispatcher: cooldown-deduped outbound notifications.
 *
 * A watchtower must never take the host down: every send is fire-and-forget
 * with errors swallowed into a single console line, and duplicate event keys
 * inside the cooldown window are dropped before they reach a provider.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WatchConfig } from './config.ts'
import type { OutboundMessage, SendFn } from './providers.ts'

export class WatchDispatcher {
  private readonly send: SendFn
  private readonly cooldownMs: number
  private readonly lastSentAt = new Map<string, number>()

  constructor(
    private readonly ctx: Context,
    private readonly config: WatchConfig,
    send: SendFn,
  ) {
    this.send = send
    this.cooldownMs = Math.max(0, (config.cooldownSeconds ?? 30) * 1000)
  }

  private enabled(kind: keyof NonNullable<WatchConfig['notify']>): boolean {
    return this.config.notify?.[kind] ?? (kind === 'requestError' ? false : true)
  }

  private passthrough(kind: string, key: string): boolean {
    const last = this.lastSentAt.get(`${kind}:${key}`)
    if (last !== undefined && Date.now() - last < this.cooldownMs) return false
    this.lastSentAt.set(`${kind}:${key}`, Date.now())
    if (this.lastSentAt.size > 512) {
      const cutoff = Date.now() - this.cooldownMs
      for (const [mapKey, at] of this.lastSentAt) {
        if (at < cutoff) this.lastSentAt.delete(mapKey)
      }
    }
    return true
  }

  /**
   * Queue one notification. Never throws; a failing provider logs once.
   */
  dispatch(message: OutboundMessage): void {
    const kind = message.kind as keyof NonNullable<WatchConfig['notify']>
    if (!this.enabled(kind)) return
    if (!this.passthrough(message.kind, message.body)) return
    this.send(message).catch((error: unknown) => {
      this.ctx.logger.warn(`dsh-watch: ${message.kind} notification failed: ${String(error)}`)
    })
  }
}
