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
})
