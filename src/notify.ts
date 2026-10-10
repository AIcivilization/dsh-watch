/**
 * WatchDispatcher: cooldown-deduped, delayed outbound notifications plus the
 * daily info digest.
 *
 * A watchtower must never take the host down: every send is fire-and-forget
 * with errors swallowed into a single console line, duplicate event keys
 * inside the cooldown window are dropped before they reach a provider, and
 * the digest is an in-memory queue whose loss on restart is acceptable.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WatchConfig } from './config.js'
import type { OutboundMessage, SendFn } from './providers.js'

export type NotifyKind = 'idle' | 'error' | 'approval' | 'question' | 'requestError' | 'subagentStart' | 'subagentEnd' | 'digest'

export class WatchDispatcher {
  private readonly send: SendFn
  private readonly cooldownMs: number
  private readonly delayMs: number
  private readonly digestHour: number
  private readonly maxInfoPerDay: number
  private readonly lastSentAt = new Map<string, number>()
  private readonly digestQueue: Array<{ at: number; text: string }> = []
  private digestTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly config: WatchConfig,
    send: SendFn,
  ) {
    this.send = send
    this.cooldownMs = Math.max(0, (config.cooldownSeconds ?? 30) * 1000)
    this.delayMs = Math.max(0, (config.delaySeconds ?? 0) * 1000)
    this.digestHour = config.digestHour ?? 21
    this.maxInfoPerDay = config.maxInfoPerDay ?? 20
  }

  private enabled(kind: NotifyKind): boolean {
    const defaults: Record<NotifyKind, boolean> = {
      idle: true,
      error: true,
      approval: true,
      question: true,
      requestError: false,
      subagentStart: false,
      subagentEnd: false,
      digest: true,
    }
    const toggled = (this.config.notify as Record<string, boolean | undefined> | undefined)?.[kind]
    return toggled ?? defaults[kind]
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

  private deliver(message: OutboundMessage): void {
    if (this.disposed) return
    this.send(message).catch((error: unknown) => {
      this.ctx.logger.warn(`dsh-watch: ${message.kind} notification failed: ${String(error)}`)
    })
  }

  /**
   * Queue one immediate notification. Never throws; a failing provider logs once.
   */
  dispatch(message: OutboundMessage): void {
    if (!this.enabled(message.kind as NotifyKind)) return
    if (!this.passthrough(message.kind, message.body)) return
    if (this.delayMs > 0) setTimeout(() => this.deliver(message), this.delayMs).unref?.()
    else this.deliver(message)
  }

  /**
   * Queue one info message for the daily digest (active layer).
   */
  queueInfo(text: string): void {
    if (this.disposed || this.digestHour < 0) return
    if (this.digestQueue.length >= this.maxInfoPerDay) {
      this.digestQueue.push({ at: Date.now(), text: `…当日 info 条数已达上限(${this.maxInfoPerDay})，其余已丢弃。` })
      return
    }
    this.digestQueue.push({ at: Date.now(), text: text.slice(0, 400) })
  }

  /** Schedule the digest flush at the next occurrence of digestHour, local time. */
  startDigest(): void {
    if (this.disposed || this.digestHour < 0 || this.digestHour > 23) return
    const scheduleNext = (): void => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), this.digestHour, 0, 0, 0)
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
      this.digestTimer = setTimeout(() => {
        this.flushDigest()
        scheduleNext()
      }, next.getTime() - now.getTime())
      this.digestTimer.unref?.()
    }
    scheduleNext()
  }

  /** Flush the digest queue now; exposed for tests and for manual triggers. */
  flushDigest(): void {
    if (this.digestQueue.length === 0) return
    const entries = this.digestQueue.splice(0, this.digestQueue.length)
    const body = entries.map(entry => {
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return `${time} ${entry.text}`
    }).join('\n')
    this.deliver({ kind: 'digest', title: 'dsh · 今日摘要', body })
  }

  dispose(): void {
    this.disposed = true
    if (this.digestTimer !== undefined) clearTimeout(this.digestTimer)
  }
}
