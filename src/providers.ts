/**
 * Providers: one thin async function per outbound target.
 * Remote providers use the global fetch (Node >= 20); the desktop provider
 * shells out to the platform notifier. No extra dependencies either way.
 */

import { spawn } from 'node:child_process'
import type { WatchConfig } from './config.js'

export interface OutboundMessage {
  /** Short kind label, e.g. "idle" / "approval" / "digest". */
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

function fullText(message: OutboundMessage): string {
  return message.link === undefined
    ? `${message.title}\n${message.body}`
    : `${message.title}\n${message.body}\n${message.link}`
}

async function postJson(url: string, payload: unknown, label: string): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`dsh-watch: ${label} failed: ${response.status}`)
}

export function telegram(config: WatchConfig): SendFn {
  const token = requireString(config, 'token')
  const chatId = requireString(config, 'chatId')
  return async (message) =>
    postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullText(message),
      disable_web_page_preview: true,
    }, 'telegram sendMessage')
}

export function bark(config: WatchConfig): SendFn {
  const barkUrl = requireString(config, 'barkUrl')
  return async (message) =>
    postJson(barkUrl, { title: message.title, body: message.body, group: 'dsh', url: message.link }, 'bark push')
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

export function slack(config: WatchConfig): SendFn {
  const url = requireString(config, 'slackWebhook')
  return async (message) => postJson(url, { text: fullText(message) }, 'slack webhook')
}

export function discord(config: WatchConfig): SendFn {
  const url = requireString(config, 'discordWebhook')
  return async (message) => postJson(url, { content: fullText(message).slice(0, 2000) }, 'discord webhook')
}

export function lark(config: WatchConfig): SendFn {
  const url = requireString(config, 'larkWebhook')
  return async (message) =>
    postJson(url, { msg_type: 'text', content: { text: fullText(message) } }, 'lark webhook')
}

export function webhook(config: WatchConfig): SendFn {
  const url = requireString(config, 'webhookUrl')
  return async (message) => postJson(url, { ...message, at: Date.now() }, 'webhook POST')
}

/** Escape a value for safe interpolation into an AppleScript double-quoted string. */
function appleScriptEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Escape a value for safe interpolation into a PowerShell double-quoted string. */
function powerShellEscape(text: string): string {
  return text.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$').replace(/\r?\n/g, '`n')
}

function run(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', shell: false })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`dsh-watch: ${label} exited with ${code ?? 'signal'}`))))
  })
}

/**
 * Local desktop notification for a dsh running on the user's own machine —
 * macOS osascript, Linux notify-send, Windows balloon tip. Remote deep links
 * do not apply here; the body alone carries the message.
 */
export function desktop(): SendFn {
  return async (message) => {
    const title = message.title
    const body = message.body.slice(0, 400)
    if (process.platform === 'darwin') {
      await run('osascript', ['-e', `display notification "${appleScriptEscape(body)}" with title "${appleScriptEscape(title)}"`], 'osascript')
    } else if (process.platform === 'linux') {
      await run('notify-send', [title, body], 'notify-send')
    } else if (process.platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$n = New-Object System.Windows.Forms.NotifyIcon`,
        '$n.Icon = [System.Drawing.SystemIcons]::Information',
        `$n.Visible = $true`,
        `$n.ShowBalloonTip(10000, "${powerShellEscape(title)}", "${powerShellEscape(body)}", [System.Windows.Forms.ToolTipIcon]::Info)`,
        'Start-Sleep -Seconds 1',
        '$n.Dispose()',
      ].join('; ')
      await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 'powershell toast')
    } else {
      throw new Error(`dsh-watch: desktop provider does not support platform "${process.platform}"`)
    }
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
    case 'slack':
      return slack(config)
    case 'discord':
      return discord(config)
    case 'lark':
      return lark(config)
    case 'webhook':
      return webhook(config)
    case 'desktop':
      return desktop()
    default:
      throw new Error(`dsh-watch: unknown provider "${String(config.provider)}"`)
  }
}
