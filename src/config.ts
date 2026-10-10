import Schema from '@deepseek-ai/schemastery'

/**
 * Where to send notifications. `desktop` covers the local machine
 * (macOS osascript / Linux notify-send / Windows toast) so dsh-watch also
 * serves a dsh that runs on the user's own computer, not only on a VPS.
 */
export type ProviderKind = 'telegram' | 'bark' | 'ntfy' | 'webhook' | 'slack' | 'discord' | 'lark' | 'desktop'

export interface WatchConfig {
  /** Outbound provider. */
  provider: ProviderKind
  /** Telegram bot token (provider=telegram). */
  token?: string
  /** Telegram chat id (provider=telegram). */
  chatId?: string
  /** Bark device URL, e.g. https://api.day.app/xxxx (provider=bark). */
  barkUrl?: string
  /** ntfy topic, served at https://ntfy.sh/<topic> (provider=ntfy). */
  ntfyTopic?: string
  /** Slack incoming webhook URL (provider=slack). */
  slackWebhook?: string
  /** Discord webhook URL (provider=discord). */
  discordWebhook?: string
  /** Lark/飞书 bot webhook URL (provider=lark). */
  larkWebhook?: string
  /** Generic webhook URL receiving a JSON POST (provider=webhook). */
  webhookUrl?: string
  /** Base URL of the dsh web UI, used to build deep links in notifications. */
  linkBase?: string
  /** Suppress repeated notifications for the same event key within this window. */
  cooldownSeconds?: number
  /** Hold every notification this many seconds before sending (anti-disturb). */
  delaySeconds?: number
  /** Only notify about idle agents after a turn ran at least this long. */
  minRunSeconds?: number
  /** Register the `notify` tool + system-prompt line so the agent can reach out on its own. */
  active?: boolean
  /** Local hour (0-23) at which the info digest is flushed. -1 disables the digest. */
  digestHour?: number
  /** Hard cap of info messages kept per day; beyond the cap, drop with a count note. */
  maxInfoPerDay?: number
  /** Toggle individual notification kinds. */
  notify?: {
    idle?: boolean
    error?: boolean
    approval?: boolean
    question?: boolean
    requestError?: boolean
    subagentStart?: boolean
    subagentEnd?: boolean
  }
}

export const Config: Schema<WatchConfig> = Schema.intersect([
  Schema.object({
    provider: Schema.union([
      Schema.const('telegram').description('Telegram Bot'),
      Schema.const('bark').description('Bark (iOS)'),
      Schema.const('ntfy').description('ntfy.sh'),
      Schema.const('webhook').description('Generic JSON webhook'),
      Schema.const('slack').description('Slack incoming webhook'),
      Schema.const('discord').description('Discord webhook'),
      Schema.const('lark').description('Lark/飞书 bot webhook'),
      Schema.const('desktop').description('Local desktop notification'),
    ]).required().description('Outbound provider'),
    token: Schema.string().description('Telegram bot token'),
    chatId: Schema.string().description('Telegram chat id'),
    barkUrl: Schema.string().role('url').description('Bark device URL'),
    ntfyTopic: Schema.string().description('ntfy topic name'),
    slackWebhook: Schema.string().role('url').description('Slack webhook URL'),
    discordWebhook: Schema.string().role('url').description('Discord webhook URL'),
    larkWebhook: Schema.string().role('url').description('Lark/飞书 bot webhook URL'),
    webhookUrl: Schema.string().role('url').description('Webhook URL (JSON POST)'),
    linkBase: Schema.string().role('url').default('http://127.0.0.1:3080').description('dsh web base URL for deep links'),
    cooldownSeconds: Schema.natural().default(30).description('Dedup window per event key'),
    delaySeconds: Schema.natural().default(0).description('Hold notifications before sending'),
    minRunSeconds: Schema.natural().default(0).description('Notify idle only after a turn ran this long'),
    active: Schema.boolean().default(true).description('Give the agent a notify tool to reach out on its own'),
    digestHour: Schema.number().default(21).description('Local hour to flush the info digest; -1 disables'),
    maxInfoPerDay: Schema.natural().default(20).description('Info messages kept per day at most'),
  }),
  Schema.object({
    notify: Schema.object({
      idle: Schema.boolean().default(true).description('Turn finished, agent idle'),
      error: Schema.boolean().default(true).description('agent/error'),
      approval: Schema.boolean().default(true).description('Permission approval requested'),
      question: Schema.boolean().default(true).description('Agent asked the user a question'),
      requestError: Schema.boolean().default(false).description('Model request failed (noisy by default)'),
      subagentStart: Schema.boolean().default(false).description('Subagent started (noisy by default)'),
      subagentEnd: Schema.boolean().default(false).description('Subagent finished'),
    }),
  }),
]) as Schema<WatchConfig>
