# dsh-watch 产品策划

> 它找你 —— 把 VPS 上的 agent 从"要人盯的工具"变成"值守的同事"。

## 一、定位

**一句话**：dsh 的出站值守插件。agent 跑完、出错、等你确认时，推送主动找到你。

**问题**：dsh 所有事件封闭在进程内（官方 schedule 包明说不做邮件/短信/推送）。本地无感，但 dsh 跑在 VPS 上时，三小时的任务结束是静默的——你只有自己打开页面才知道它完事了、挂了、还是在等你批权限。

**受众**：在 VPS/远程机器上跑 dsh 的开发者（dsh 官方明确支持 SSH 场景，`dsh web --no-open` 只打印 URL）。这也正是 dsh-vps / vpssh 用户群，天然重叠。

**在产品群中的位置**：

| 产品 | 职责 |
|---|---|
| dsh-vps | 装上去 |
| dsh-vps-manager | 管起来 |
| dsh-model | 供模型 |
| vpssh | 连进来 |
| **dsh-watch** | **它找你** |

## 二、原则

1. **零 UI**。通知本身就是界面；深链接回 `dsh web`，审批和追问都在官方界面完成。
2. **只观察，不干预**。waterfall 事件原样 `next()` 传递，dsh-watch 永远不是链路上的故障点。
3. **fail-open**。读不到的事件字段只降级消息质量，绝不带倒 host。
4. **零运行时依赖**。原生 fetch，Node ≥20，插件本体薄到可以被通读。

## 三、范围边界

**做**：
- 五类事件 → 四个通道（Telegram / Bark / ntfy / webhook）
- 每事件开关、冷却去重、空闲最短运行时长（防抖）
- 深链接回链（`linkBase` 指向 vpssh 隧道即远程可达）

**不做**（克制清单，逐条都有理由）：
- 不做设置页 UI —— cordis.yml 配置够用，等用户真的要求再说
- 不做短信/邮件 —— 通道够多了，企业级通知不是这个产品的战场
- 不做会话内容同步/远程回复 —— 那是 `dsh web` + vpssh 的职责，不重造
- 不做用量统计 —— 那是 dsh-model 网关位置该看的东西

## 四、里程碑

### M1 · 真机验证（本周，~1 天）
- [ ] 在 VPS 上真实安装，验证五类事件的 payload 字段名（`prompt`/`question`/`title` 是防御式猜的，需对照真实事件修正）
- [ ] Telegram + Bark 双通道实测：任务完成、审批请求两条关键路径
- [ ] 深链接经 vpssh 隧道在手机上点通
- [ ] 修正字段 → 0.1.0 首发

### M2 · 打磨（首发后按反馈）
- [ ] 静音时段 / 静音规则（如：只在空闲超 N 分钟或报错时推）
- [ ] 按 workspace/项目路由到不同频道
- [ ] 每日 summary（数据源：session-query-sqlite，一行命令式输出，不做面板）
- [ ] dshmarket 设置卡片（若 Schema 配置在界面上体验不佳）

### M3 · 联动（与产品群互相导流）
- [ ] vpssh 一条命令带上 dsh-watch（装 VPS 即装值守）
- [ ] dsh-model 的 request-error 推送带上模型名/重试信息

## 五、分发

1. **npm**：`dsh-watch`（CI 自动发布已配，granular token + provenance）
2. **上架**：向 awesome-dsh-plugin 注册表提 PR，约 1 天被 dshmarket（6k★，4200+ 插件）自动收录 —— 这就是官网
3. **仓库标签**：`dsh-plugin` topic（GitHub 发现机制）
4. README 互相引用：dsh-vps / vpssh / dsh-model 的 README 加一行联动说明

## 六、验收与观察指标

- **功能**：五类事件在真机各触发一次，推送到达、回链可点
- **稳定**：连续跑 7 天，host 无异常日志归因于 dsh-watch
- **生态**：dshmarket 收录后自然安装量（不设 KPI，薄插件薄指标）

## 七、风险

| 风险 | 应对 |
|---|---|
| dsh 预览期破坏性变更（事件名/payload 改动） | fail-open 读取已在架构上兜底；peerDep 锁 `^4.0.1`，README 标注兼容版本 |
| 官方补做出站通知 | 概率低（schedule README 明确留白）；若发生则收缩为通道层/规则层，价值仍在 |
| payload 猜错导致首发消息质量差 | M1 真机验证是硬门槛，过了才发 0.1.0 |
