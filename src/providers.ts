/**
 * Providers: one thin async function per outbound target.
 * All of them use the global fetch (Node >= 20), no extra dependencies.
 */

import type { WatchConfig } from './config.js'

export interface OutboundMessage {
  /** Short kind label, e.g. "idle" / "approval". */
  kind: string
  /** Human title, e.g. "dsh · 任务完成". */
  title: string
  /** Body text, already trimmed to a few lines. */
  body: string
  /** Optional deep link back into the dsh web UI. */
  link?: string
}

export type SendFn = (message: OutboundMessage) => Promise<void>

function requireString(config: WatchConfig, key: keyof WatchConfig): string {
  const value = config[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`dsh-watch: missing required config "${String(key)}" for provider "${config.provider}"`)
  }
  return value
}

export function telegram(config: WatchConfig): SendFn {
  const token = requireString(config, 'token')
  const chatId = requireString(config, 'chatId')
  return async (message) => {
    const text = message.link !== undefined ? `${message.title}\n${message.body}\n${message.link}` : `${message.title}\n${message.body}`
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!response.ok) throw new Error(`dsh-watch: telegram sendMessage failed: ${response.status}`)
  }
}

export function bark(config: WatchConfig): SendFn {
  const barkUrl = requireString(config, 'barkUrl')
  return async (message) => {
    const response = await fetch(barkUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: message.title, body: message.body, group: 'dsh', url: message.link }),
    })
    if (!response.ok) throw new Error(`dsh-watch: bark push failed: ${response.status}`)
  }
}

export function ntfy(config: WatchConfig): SendFn {
  const topic = requireString(config, 'ntfyTopic')
  return async (message) => {
    const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { title: message.title, tags: 'white_check_mark', click: message.link ?? '' },
      body: message.body,
    })
    if (!response.ok) throw new Error(`dsh-watch: ntfy publish failed: ${response.status}`)
  }
}

export function webhook(config: WatchConfig): SendFn {
  const webhookUrl = requireString(config, 'webhookUrl')
  return async (message) => {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...message, at: Date.now() }),
    })
    if (!response.ok) throw new Error(`dsh-watch: webhook POST failed: ${response.status}`)
  }
}

export function resolveSend(config: WatchConfig): SendFn {
  switch (config.provider) {
    case 'telegram':
      return telegram(config)
    case 'bark':
      return bark(config)
    case 'ntfy':
      return ntfy(config)
    case 'webhook':
      return webhook(config)
    default:
      throw new Error(`dsh-watch: unknown provider "${String(config.provider)}"`)
  }
}
