/**
 * Event wiring: subscribe to the dsh agent lifecycle and turn harness events
 * into outbound notifications.
 *
 * Payload shapes are read defensively as structural subsets, mirroring the
 * "fail open" convention of ecosystem plugins: an unexpected payload must
 * never crash the host, only degrade this plugin's message quality.
 *
 * Event kinds used here (see docs/event-producer-consumer.md in the dsh repo):
 * - agent/status        (emit)     running/idle transitions
 * - agent/error         (emit)     agent-level errors
 * - agent/turn-stopping (serial)   natural stop checkpoint
 * - agent/request-error (waterfall) model request failures, chained via next()
 * - approval/request    (waterfall) permission approval requested
 * - user-questions/request (waterfall) agent asked the user a question
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WatchConfig } from './config.ts'
import type { WatchDispatcher } from './notify.ts'

/** Structural subset of agent/status payloads. */
interface StatusEventLike {
  agentId?: unknown
  status?: unknown
}

/** Structural subset of error-ish payloads carrying a message field. */
interface ErrorEventLike {
  agentId?: unknown
  message?: unknown
  error?: unknown
}

/** Structural subset of approval / question payloads. */
interface AskEventLike {
  agentId?: unknown
  prompt?: unknown
  title?: unknown
  question?: unknown
  message?: unknown
}

function agentKey(event: object): string {
  const id = (event as { agentId?: unknown }).agentId
  return typeof id === 'string' && id !== '' ? id : 'agent'
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function tail(text: string | undefined, lines: number): string {
  if (text === undefined) return ''
  return text.split('\n').slice(-lines).join('\n').slice(0, 800)
}

function deepLink(linkBase: string | undefined, agentId: string): string | undefined {
  return linkBase !== undefined ? `${linkBase.replace(/\/+$/, '')}/#agent=${encodeURIComponent(agentId)}` : undefined
}

export function wireAgentEvents(ctx: Context, dispatcher: WatchDispatcher, config: WatchConfig): void {
  const runningSince = new Map<string, number>()
  const minRunMs = Math.max(0, (config.minRunSeconds ?? 0) * 1000)

  const linkBase = config.linkBase

  ctx.on('agent/status', (event: StatusEventLike) => {
    const agentId = agentKey(event as object)
    if (event.status === 'running') {
      runningSince.set(agentId, Date.now())
      return
    }
    if (event.status !== 'idle') return
    const startedAt = runningSince.get(agentId)
    runningSince.delete(agentId)
    if (startedAt === undefined || (minRunMs > 0 && Date.now() - startedAt < minRunMs)) return
    dispatcher.dispatch({
      kind: 'idle',
      title: 'dsh · 任务完成',
      body: 'Agent 已空闲，回合结束。',
      link: deepLink(linkBase, agentId),
    })
  })

  ctx.on('agent/error', (event: ErrorEventLike) => {
    dispatcher.dispatch({
      kind: 'error',
      title: 'dsh · Agent 出错',
      body: tail(firstText(event.message, event.error), 4),
      link: deepLink(linkBase, agentKey(event as object)),
    })
  })

  ctx.on('agent/turn-stopping', () => {
    // Natural-stop checkpoint: intentionally quiet, idle notification above
    // already covers the common case. Kept as a seam for future quiet rules.
  })

  ctx.on('agent/request-error', (event: ErrorEventLike, next: (value: ErrorEventLike) => unknown) => {
    dispatcher.dispatch({
      kind: 'requestError',
      title: 'dsh · 模型请求失败',
      body: tail(firstText(event.message, event.error), 4),
    })
    return next(event)
  })

  ctx.on('approval/request', (event: AskEventLike, next: (value: AskEventLike) => unknown) => {
    dispatcher.dispatch({
      kind: 'approval',
      title: 'dsh · 等待权限确认',
      body: tail(firstText(event.title, event.prompt, event.message), 4),
      link: deepLink(linkBase, agentKey(event as object)),
    })
    return next(event)
  })

  ctx.on('user-questions/request', (event: AskEventLike, next: (value: AskEventLike) => unknown) => {
    dispatcher.dispatch({
      kind: 'question',
      title: 'dsh · Agent 在问你',
      body: tail(firstText(event.question, event.title, event.prompt, event.message), 6),
      link: deepLink(linkBase, agentKey(event as object)),
    })
    return next(event)
  })
}

