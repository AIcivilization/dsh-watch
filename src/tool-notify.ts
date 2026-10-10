/**
 * Active layer: the `notify` tool. The agent itself decides what is worth
 * telling the user mid-turn — a discovery, a blocker, a decision — and calls
 * this tool. urgent pushes immediately; info lands in the daily digest.
 *
 * The registration mirrors the official tool-schedule package: `defineTool`
 * from @deepseek-ai/dsh-tools, registered into the mounting scope through
 * `ctx.tools.register` (the plugin declares `inject = ['tools']`).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type { WatchDispatcher } from './notify.js'

const NOTIFY_DESCRIPTION =
  'Contact the user directly with a short message. Use it when something is worth their attention mid-task: '
  + 'a significant discovery, a decision they should weigh in on, or a blocker that needs their input. '
  + 'Set urgency "urgent" only for what cannot wait until they next check in; routine progress and minor notes '
  + 'should use "info", which lands in the daily digest instead of pushing immediately. Do not send trivial updates.'

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        delivered: { type: 'boolean', required: true },
        urgency: { type: 'string', required: true, enum: ['urgent', 'info'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string', required: true, const: 'invalid_message' },
        message: { type: 'string', required: true },
      },
    },
  ],
} as const

interface NotifyArgs {
  message: string
  urgency?: string
}

/** Deterministic model content for the canonical notify receipt. */
function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Pure generic pending card. */
function presentCall(args: NotifyArgs): GenericCallView {
  return { card: 'generic', title: 'Notify user', kind: 'other', rawInput: args.message }
}

/**
 * Register the notify tool in the mounting scope.
 * @param ctx - Scope whose `tools` registry this registers into.
 * @param dispatcher - Outbound dispatcher that routes urgent/info messages.
 */
export function registerNotifyTool(ctx: Context, dispatcher: WatchDispatcher): void {
  ctx.tools.register(defineTool({
    name: 'notify',
    description: NOTIFY_DESCRIPTION,
    parameters: {
      message: {
        type: 'string',
        required: true,
        description: 'Short human-readable message for the user, one to three sentences.',
      },
      urgency: {
        type: 'string',
        description: '"urgent" pushes immediately; "info" (default) lands in the daily digest.',
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: renderValue },
    async execute(args: NotifyArgs): Promise<{ delivered: boolean; urgency: 'urgent' | 'info' } | { code: 'invalid_message'; message: string }> {
      const message = args.message.trim()
      if (message.length === 0) {
        return { code: 'invalid_message', message: 'notify message must be non-empty after trimming.' }
      }
      const urgency: 'urgent' | 'info' = args.urgency === 'urgent' ? 'urgent' : 'info'
      if (urgency === 'urgent') {
        dispatcher.dispatch({ kind: 'urgent', title: 'dsh · Agent 汇报', body: message.slice(0, 800) })
      } else {
        dispatcher.queueInfo(message)
      }
      return { delivered: true, urgency }
    },
    presentCall,
  }))
}
