import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { WatchDispatcher } from '../src/notify.ts'
import type { OutboundMessage } from '../src/providers.ts'

function fakeContext(): Context {
  return { logger: { warn: vi.fn(), info: vi.fn() } } as unknown as Context
}

function message(kind: string, body: string): OutboundMessage {
  return { kind, title: `dsh · ${kind}`, body }
}

describe('WatchDispatcher', () => {
  it('drops duplicate event keys inside the cooldown window', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const dispatcher = new WatchDispatcher(fakeContext(), { provider: 'webhook', cooldownSeconds: 30 } as never, send)

    dispatcher.dispatch(message('idle', 'Agent 已空闲'))
    dispatcher.dispatch(message('idle', 'Agent 已空闲'))
    await new Promise(resolve => setImmediate(resolve))

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('never throws when the provider fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))
    const ctx = fakeContext()
    const dispatcher = new WatchDispatcher(ctx, { provider: 'ntfy' } as never, send)

    expect(() => dispatcher.dispatch(message('error', 'boom'))).not.toThrow()
    await vi.waitFor(() => expect(ctx.logger.warn).toHaveBeenCalled())
  })

  it('honors notify toggles (requestError off by default)', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const dispatcher = new WatchDispatcher(fakeContext(), { provider: 'webhook' } as never, send)

    dispatcher.dispatch(message('requestError', 'rate limited'))
    await new Promise(resolve => setImmediate(resolve))

    expect(send).not.toHaveBeenCalled()
  })

  it('flushes the info digest on demand', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const dispatcher = new WatchDispatcher(fakeContext(), { provider: 'webhook', maxInfoPerDay: 2 } as never, send)

    dispatcher.queueInfo('发现 A')
    dispatcher.queueInfo('发现 B')
    dispatcher.flushDigest()
    dispatcher.flushDigest()
    await new Promise(resolve => setImmediate(resolve))

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0] as { title: string; body: string }
    expect(payload.title).toContain('今日摘要')
    expect(payload.body).toContain('发现 A')
    expect(payload.body).toContain('发现 B')
  })

  it('caps info messages per day and notes the drop', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const dispatcher = new WatchDispatcher(fakeContext(), { provider: 'webhook', maxInfoPerDay: 1 } as never, send)

    dispatcher.queueInfo('第一条')
    dispatcher.queueInfo('第二条会被记为超限')
    dispatcher.flushDigest()
    await new Promise(resolve => setImmediate(resolve))

    const payload = send.mock.calls[0]?.[0] as { body: string }
    expect(payload.body).toContain('第一条')
    expect(payload.body).toContain('上限')
  })
})
