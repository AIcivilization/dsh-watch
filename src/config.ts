import Schema from '@deepseek-ai/schemastery'

/**
 * Where to send notifications. One provider per profile for now;
 * multiple targets can be composed later via additional config blocks.
 */
export type ProviderKind = 'telegram' | 'bark' | 'ntfy' | 'webhook'

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
  /** Generic webhook URL receiving a JSON POST (provider=webhook). */
  webhookUrl?: string
  /** Base URL of the dsh web UI, used to build deep links in notifications. */
  linkBase?: string
  /** Suppress repeated notifications for the same event key within this window. */
  cooldownSeconds?: number
  /** Only notify about idle agents after a turn ran at least this long. */
  minRunSeconds?: number
  /** Toggle individual notification kinds. */
  notify?: {
    idle?: boolean
    error?: boolean
    approval?: boolean
    question?: boolean
    requestError?: boolean
  }
}

export const Config: Schema<WatchConfig> = Schema.intersect([
  Schema.object({
    provider: Schema.union([
      Schema.const('telegram').description('Telegram Bot'),
      Schema.const('bark').description('Bark (iOS)'),
      Schema.const('ntfy').description('ntfy.sh'),
      Schema.const('webhook').description('Generic JSON webhook'),
    ]).required().description('Outbound provider'),
    token: Schema.string().description('Telegram bot token'),
    chatId: Schema.string().description('Telegram chat id'),
    barkUrl: Schema.string().role('url').description('Bark device URL'),
    ntfyTopic: Schema.string().description('ntfy topic name'),
    webhookUrl: Schema.string().role('url').description('Webhook URL (JSON POST)'),
    linkBase: Schema.string().role('url').default('http://127.0.0.1:3080').description('dsh web base URL for deep links'),
    cooldownSeconds: Schema.natural().default(30).description('Dedup window per event key'),
    minRunSeconds: Schema.natural().default(0).description('Notify idle only after a turn ran this long'),
  }),
  Schema.object({
    notify: Schema.object({
      idle: Schema.boolean().default(true).description('Turn finished, agent idle'),
      error: Schema.boolean().default(true).description('agent/error'),
      approval: Schema.boolean().default(true).description('Permission approval requested'),
      question: Schema.boolean().default(true).description('Agent asked the user a question'),
      requestError: Schema.boolean().default(false).description('Model request failed (noisy by default)'),
    }),
  }),
]) as Schema<WatchConfig>
