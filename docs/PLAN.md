# dsh-watch 产品策划

> 它找你 —— 把 VPS 上的 agent 从"要人盯的工具"变成"值守的同事"。

## 一、定位

**一句话**：dsh 的值守插件。agent 干完、卡住、有发现时，主动找到用户——不是机器出问题才报警，是 agent 活着、在干你的事、随时向你开口。

**关键区分——dsh-watch 不是监控产品**：

| | 传统监控（Zabbix/UptimeRobot） | dsh-watch |
|---|---|---|
| 触发 | 异常驱动：出事才响 | 价值驱动：有值得说的事就说 |
| 对象 | 机器和进程 | agent 和它正在办的事 |
| 心智 | 值班告警 | 同事汇报 |

如果只做异常告警，dsh-watch 就是 UptimeRobot 的微型替代品，价值很薄。真正的定位是** agent 的出站表达通道**：干完了汇报、有发现分享、拿不准请示、出错了认错。

**问题**：dsh 所有事件封闭在进程内（官方 schedule 包明说不做邮件/短信/推送）。官方给 agent 的表达通道只有 `user-questions/request`——卡住了才反问。留白有两层：**通知送不出去**（被动层），以及 **agent 没法主动开口**（主动层）。

**受众**：在 VPS/远程机器上跑 dsh 的开发者（dsh 官方明确支持 SSH 场景）。与 dsh-vps / vpssh 用户群天然重叠。

**在产品群中的位置**：

| 产品 | 职责 |
|---|---|
| dsh-vps | 装上去 |
| dsh-vps-manager | 管起来 |
| dsh-model | 供模型 |
| vpssh | 连进来 |
| **dsh-watch** | **它找你** |

## 二、双层模型（产品核心）

### 被动层：兜底

事件规则 → 推送。监听七类事件：`agent/status`（跑完）、`agent/error`、`approval/request`（等批权限）、`user-questions/request`（反问）、`agent/request-error`（默认关）、`subagent/start`、`subagent/end`（默认关）。八个通道：Telegram / Bark / ntfy / Slack / Discord / Lark(飞书) / 通用 webhook / **desktop**（mac/Linux/Windows 桌面通知——本地跑 dsh 也覆盖，产品不限于 VPS）。另有延迟投递（`delaySeconds`）与冷却去重。被动层回答"agent 状态如何"——这层保证 agent 永远不会失联地完成或卡死，是地板，不是产品。

### 主动层：跃迁

给 agent 一张嘴：注册 `notify` 工具 + 经 `system-prompt/assemble` 注入一句"你可以随时用 notify 主动联系用户"。agent 在回合中自己判断什么值得打断用户：

> `notify("我发现第三方的支付回调没有验签，要不要我继续深挖？")`

主动层回答"**agent 觉得什么事值得你知道**"。场景彻底打开：代码审查跑两小时，中途发现可疑漏洞当场举手，而不是憋到结束；调研任务全程都是"发现"。

官方证据支持这条路可行且无竞争：tool-schedule 就是同款做法（注册工具让 agent 自主调用），而"没卡住也想说"这个通道没有任何官方包在做。

### 竞品基线（2026-10 调研）

对标 [agent-notifications](https://github.com/777genius/claude-notifications-go)（816★，Claude/Codex/OpenCode/Gemini 四生态）与 OpenCode 通知插件族（opencode-notification 等）：

| 功能 | agent-notifications | OpenCode 族 | dsh-watch |
|---|---|---|---|
| 事件：完成/出错/审批/提问 | ✅ | ✅（四事件，同构） | ✅ |
| 会话限额事件 | ✅ | — | ✗（dsh 无对应事件，不做） |
| 子代理事件开关 | ✅ | — | ✅（默认关） |
| 通道 | Slack/Discord/Telegram/飞书/自定义 | 桌面为主 | 8 通道（含桌面，全平台） |
| 点击聚焦原始终端 | ✅ | — | ✗（dsh 场景=web 深链接，已有） |
| 防打扰（延迟/去重） | ✅（DND/聚焦感知/延迟） | ✅（延迟 15s） | ✅（延迟/冷却/minRun 防抖；聚焦感知 headless 无从谈起，不做） |
| **agent 主动通知** | ✅（agent-notify MCP） | — | ✅（notify 工具，一等公民而非外挂 MCP） |

结论：被动层补齐地面（通道/延迟/子代理）后与 816★ 标杆功能面打平；主动层我们做进插件本体（标杆是外挂 MCP），且绑定 dsh 的 system-prompt 瀑布，教给 agent 的"发送品位"更深。

## 三、原则

1. **零 UI**。通知本身就是界面；深链接回 `dsh web`，审批和追问都在官方界面完成。
2. **只观察，不干预**。waterfall 事件原样 `next()` 传递；`notify` 是纯出站工具，无副作用、不读写任何状态。
3. **fail-open**。读不到的事件字段只降级消息质量，绝不带倒 host。
4. **零运行时依赖**。原生 fetch，Node ≥20，插件本体薄到可以被通读。

## 四、主动层设计要点

**消息分级**。同事不能什么都发。`notify` 工具签名带 `urgency` 参数：

- `urgent` —— 即时推送（同被动层通道）
- `info` —— 进当日摘要，不即时打扰

防打扰的机制从"冷却窗口"（被动层）升级为"编辑判断"（agent 自己决定级别），插件再用配置兜底（如 info 每日最多 N 条）。

**prompt 注入要克制**。注入文案一句话以内，只说"有值得用户立即知道的事可用 notify(urgency) 联系用户，琐碎进展不要发"。措辞直接影响 agent 的发送品位，是产品体验的一部分，需要迭代调优。

**汇报的边界**。notify 只出站"信息"，不做"指令"——不支持通过推送回复来远程驾驶 agent（回复走 `dsh web` + vpssh 回链）。这条边界守住，插件才不会滑向"IM 机器人"的重坑。

**digest（当日摘要）**。info 级消息 + 被动层可汇总事件，每日一次推送。数据源 session-query-sqlite，纯文本几行，不做面板。

## 五、范围边界

**做**：
- 被动层：五类事件 → 四通道（Telegram / Bark / ntfy / webhook），开关/冷却/防抖
- 主动层：`notify` 工具（urgency 分级）+ system-prompt 注入 + digest
- 深链接回链（`linkBase` 指向 vpssh 隧道即远程可达）

**不做**（克制清单，逐条都有理由）：
- 不做设置页 UI —— cordis.yml 配置够用，等用户真的要求再说
- 不做短信/邮件 —— 通道够多了，企业级通知不是这个产品的战场
- 不做双向对话/远程回复 —— 推送只出信息不收指令；驾驶 agent 是 `dsh web` + vpssh 的职责
- 不做会话内容同步 —— 同上，不重造
- 不做用量统计 —— 那是 dsh-model 网关位置该看的东西（联动时让它带数据，不做本体）

## 六、里程碑

### M1 · 真机验证（代码已完成，待装机，~1 天）
- [ ] VPS 真实安装，验证事件 payload 字段名（防御式猜的，需对照真实事件修正）
- [ ] Telegram + desktop 双通道实测：任务完成、审批请求两条关键路径
- [ ] `notify` 工具注册与调用实测（真机观察 agent 发送品位，调 prompt 措辞）
- [ ] 深链接经 vpssh 隧道在手机上点通
- [ ] 修正 → 0.1.0 首发（双层一起发：被动层已与 816★ 标杆功能面打平，主动层是差异点，首发即立住定位）

### M2 · 打磨（首发后按反馈）
- [ ] 静音时段 / 静音规则
- [ ] 按 workspace/项目路由到不同频道
- [ ] vpssh 一条命令带上 dsh-watch（装 VPS 即装值守）
- [ ] dsh-model 联动：request-error / urgent 推送带模型名与 token 成本

## 七、分发

1. **npm**：`dsh-watch`（CI 自动发布已配，granular token + provenance）
2. **上架**：向 awesome-dsh-plugin 注册表提 PR，约 1 天被 dshmarket（6k★，4200+ 插件）自动收录 —— 这就是官网
3. **仓库标签**：`dsh-plugin` topic（GitHub 发现机制）
4. README 互相引用：dsh-vps / vpssh / dsh-model 各加一行联动说明

## 八、验收与观察指标

- **被动层**：五类事件真机各触发一次，推送到达、回链可点
- **主动层**：真机长任务（如代码审查）中 agent 能恰当使用 notify——urgent 该发的发了，info 没有刷屏
- **稳定**：连续跑 7 天，host 无异常日志归因于 dsh-watch
- **生态**：dshmarket 收录后自然安装量（不设 KPI，薄插件薄指标）

## 九、风险

| 风险 | 应对 |
|---|---|
| dsh 预览期破坏性变更（事件名/payload/工具注册 API 改动） | fail-open 读取已在架构上兜底；peerDep 锁 `^4.0.1`；主动层只依赖工具注册与 prompt 注入两个最标准的 Cordis seam |
| agent 滥用 notify（刷屏/废话） | urgency 分级 + 每日上限 + prompt 措辞调优三道闸；M2 真机观察后再放开发布 |
| 官方补做出站通知 | 概率低（schedule README 明确留白）；若发生则收缩为通道层/规则层，主动层的编辑判断价值仍在 |
| payload 猜错导致首发消息质量差 | M1 真机验证是硬门槛，过了才发 0.1.0 |
