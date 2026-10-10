# dsh-watch

**Outbound watchtower for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh)** — when your agent finishes, fails, waits for you, or has something worth telling you, the notification comes to you. · **dsh 值守插件**：agent 跑完、出错、等你确认、有话要说时，推送会主动找到你。

dsh keeps every event inside the process. Its built-in schedule package delivers reminders as in-conversation follow-ups *"rather than email, SMS, or push notifications"*. On a VPS that means a three-hour task finishes silently while you are away — `dsh-watch` closes that gap, in two layers, with zero UI: the notification itself is the interface.

## Two layers

**Passive floor** — dsh-watch listens to the agent lifecycle and pushes the moments that matter:

| Event | dsh source | Notification |
| --- | --- | --- |
| Turn finished, agent idle | `agent/status` | **任务完成** — with a deep link back into the dsh web console |
| Agent error | `agent/error` | **Agent 出错** — tail of the error message |
| Permission approval requested | `approval/request` | **等待权限确认** |
| Agent asked you a question | `user-questions/request` | **Agent 在问你** |
| Model request failed | `agent/request-error` | off by default (noisy) |
| Subagent started / finished | `subagent/start`, `subagent/end` | off by default |

Waterfall events (`approval/request`, `user-questions/request`, `agent/request-error`) are chained through untouched — dsh-watch observes, never interferes.

**Active voice** — dsh-watch also registers a `notify` tool (plus one system-prompt line) so the agent itself can reach out mid-turn:

> `notify("我发现第三方的支付回调没有验签，要不要我继续深挖？", urgency: "urgent")`

- `urgent` pushes immediately
- `info` lands in the daily digest (flushed at `digestHour`, capped by `maxInfoPerDay`)

Silence is the default; the tool description teaches restraint. Notifications are strictly one-way — replying and steering the agent stay in the dsh web console.

## Install

Requires dsh web `>= 0.1.0-rc.6`:

```bash
dsh plugin --profile web add dsh-watch
```

## Configure

In your dsh plugin config (`cordis.yml` / the plugin's settings card):

```yaml
dsh-watch:
  provider: telegram
  token: "123456:ABC..."
  chatId: "123456789"
  linkBase: "http://127.0.0.1:3080"   # deep-link target, e.g. a vpssh tunnel
  cooldownSeconds: 30
  delaySeconds: 0                     # hold notifications before sending
  active: true                        # give the agent the notify tool
  digestHour: 21                      # local hour for the info digest; -1 disables
  maxInfoPerDay: 20
  notify:
    idle: true
    error: true
    approval: true
    question: true
    requestError: false
    subagentStart: false
    subagentEnd: false
```

Providers: **Telegram** · **Bark** (iOS) · **ntfy.sh** · **Slack** · **Discord** · **Lark/飞书** · **generic webhook** (JSON POST) · **desktop** (macOS osascript / Linux notify-send / Windows toast — for a dsh running on your own machine).

For remote access point `linkBase` at your tunnel — dsh-watch pairs naturally with [vpssh](https://github.com/AIcivilization/vpssh).

## Design notes

- **Fail open.** Event payloads are read as defensive structural subsets; an unexpected payload never crashes the host, it only degrades message quality.
- **Never the bottleneck.** All sends are fire-and-forget; provider failures log one line and vanish. Duplicate keys inside the cooldown window are dropped before hitting the provider.
- **Zero runtime dependencies.** Global `fetch` plus `node:child_process` for desktop toasts (Node >= 20). Peer deps are the host's `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-tools` and `@deepseek-ai/schemastery`.
- **In-memory digest.** The info queue lives in memory; losing queued info on a restart is accepted for the thinness it buys.

## Status

Feature-complete against the ecosystem baseline (see `docs/PLAN.md`). Event payload field names (`prompt` / `question` / `title`) and the notify tool registration still need validation against a live host before first stable release.

## License

MIT © [AIcivilization](https://github.com/AIcivilization)
