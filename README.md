# dsh-watch

**Outbound watchtower for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh)** — when your agent finishes, fails, or waits for you, the notification comes to you. · **dsh 值守插件**：agent 跑完、出错、等你确认时，推送会主动找到你。

dsh keeps every event inside the process. Its built-in schedule package delivers reminders as in-conversation follow-ups *"rather than email, SMS, or push notifications"*. On a VPS that means a three-hour task finishes silently while you are away — `dsh-watch` closes that gap with one thin plugin: no UI, no accounts, the notification itself is the interface.

## What it watches

| Event | dsh source | Notification |
| --- | --- | --- |
| Turn finished, agent idle | `agent/status` | **任务完成** — with a deep link back into the dsh web console |
| Agent error | `agent/error` | **Agent 出错** — tail of the error message |
| Permission approval requested | `approval/request` | **等待权限确认** |
| Agent asked you a question | `user-questions/request` | **Agent 在问你** |
| Model request failed | `agent/request-error` | off by default (noisy) |

Waterfall events (`approval/request`, `user-questions/request`, `agent/request-error`) are chained through untouched — dsh-watch observes, never interferes.

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
  notify:
    idle: true
    error: true
    approval: true
    question: true
    requestError: false
```

Providers: **Telegram** (bot token + chat id) · **Bark** (iOS, device URL) · **ntfy.sh** (topic) · **generic webhook** (JSON POST). For remote access point `linkBase` at your tunnel — dsh-watch pairs naturally with [vpssh](https://github.com/AIcivilization/vpssh).

## Design notes

- **Fail open.** Event payloads are read as defensive structural subsets; an unexpected payload never crashes the host, it only degrades message quality.
- **Never the bottleneck.** All sends are fire-and-forget; provider failures log one line and vanish. Duplicate keys inside the cooldown window are dropped before hitting the provider.
- **Zero dependencies.** Global `fetch` only (Node >= 20). Peer deps are the host's `@deepseek-ai/cordis` and `@deepseek-ai/schemastery`.

## Status

Skeleton — event wiring and provider surface are in place against the dsh `event-producer-consumer` matrix; payload field names (`prompt` / `question` / `title`) need validation against a live host before first stable release.

## License

MIT © [AIcivilization](https://github.com/AIcivilization)
