# 2026 Solana 黑客松参赛建议

截至 2026-03-31，这份文档的目标不是给你一堆泛泛的点子，而是给你一个更接近“能拿奖、能做完、能讲明白”的方向，并把理由、产品设计、实现路径和提交策略一次讲清楚。

## 先说结论

如果你要押一个今年更有胜率的方向，我建议你做：

**PolicyPay**

一句话定义：

**一个面向企业、团队和 AI Agent 的稳定币支付操作层。Agent 或运营后台先生成付款/发票/批量结算意图，人类用钱包看到可读的 typed approval 后确认，Relayer 再 gasless 地把链上交易执行掉。**

更直白一点：

- 不是再做一个“稳定币钱包”
- 不是再做一个“跨境支付 App”
- 也不是再做一个“智能钱包”
- 而是做一层真正把 **稳定币支付 + 人类审批 + Agent 自动化 + Gasless UX + 可审计运营** 接起来的基础设施

这是我认为目前最接近“评委会喜欢、市场也认可、你还能在 hackathon 里做出完整 demo”的交叉点。

## 时间和赛事状态

需要先把日期讲清楚。

- 当前时间是 **2026-03-31**
- [Colosseum 官网](https://colosseum.com/) 当前公开页面写的是：**“Colosseum's next hackathon is happening now!”**，并且页面顶部出现了 **Agent Hackathon** 文案
- [Colosseum Get Started 页面](https://www.colosseum.com/get-started) 说明 Colosseum **每年两次线上 hackathon**

这意味着两件事：

1. **截至 2026-03-31，公网可见的“当前 hackathon”很可能已经偏 Agent/AI 主题。**
2. 我没有找到 2026 年下一场通用 Solana hackathon 的公开赛道页，所以最稳的策略不是押一个纯旧赛道，而是押一个 **既能讲 agent story，也能讲 infra / stablecoin story** 的项目。

PolicyPay 正好符合这一点。

## 研究范围和证据

我参考了四类一手来源：

- Colosseum/Copilot 的历届 Solana hackathon 项目数据和获奖数据
- Solana 官方新闻和官方文档
- Solana Developer Forums 的 `RFP`、`sRFC`、`SIMD` 讨论
- Colosseum 当前公开页面和当前项目列表

其中历史数据覆盖四届：

- `Renaissance`，开始于 **2024-03-04**，`1076` 个项目，`85` 个获奖
- `Radar`，开始于 **2024-09-02**，`1360` 个项目，`58` 个获奖
- `Breakout`，开始于 **2025-04-14**，`1416` 个项目，`85` 个获奖
- `Cypherpunk`，开始于 **2025-09-25**，`1576` 个项目，`65` 个获奖

合计约 `5428` 个项目，`293` 个获奖项目。

## 历史上什么更容易得奖

### 1. 评委喜欢“真实业务痛点 + Solana 原生优势 + 可演示的完整流程”

历史上表现最强的方向，不是“概念最酷”的，而是“问题非常明确，Solana 为什么适合也讲得很清楚”的：

- 稳定币支付和跨境结算
- 开发者基础设施
- 交易与流动性相关工具
- 能把复杂链上动作压缩成简单 UX 的产品

很典型的例子：

- [CargoBill](https://arena.colosseum.org/projects/explore/cargobill)：`Breakout 2025` 稳定币赛道第一。它不是泛泛讲支付，而是把场景钉死在供应链结算。
- [Seer](https://arena.colosseum.org/projects/explore/seer)：`Cypherpunk 2025` Infrastructure 第一。它不是泛泛讲“调试”，而是直接做出类似 Tenderly 的 Solana 交易调试器。
- [Tokamai](https://arena.colosseum.org/projects/explore/tokamai)：`Radar 2024` Infrastructure 第二。直接解决合约上线后的监控和告警。
- [IDL Space](https://arena.colosseum.org/projects/explore/idl-space)：`Breakout 2025` Public Goods Award。不是新协议，而是非常具体的开发工具。

### 2. 技术深度仍然重要，特别是 Rust / Anchor / Solana-specific primitive

获奖项目相对全体参赛项目，明显更偏：

- `Rust`
- `Anchor`
- 明确使用 `oracle`
- 明确使用 Solana 原生账户模型、交易模型、支付和批处理能力

相反，下面这些在总项目池里很多，但获奖里没有那么吃香：

- 纯 AI 包装
- 泛 NFT 玩法
- 纯 gamification
- 没有真正 Solana-specific 技术壁垒的前端壳子

换句话说：

**AI 不是不能做，但 AI 不能是唯一卖点。**

### 3. “开发者工具”是长期得奖方向，不是冷门角落

很多人低估了这一点。历史上，开发者工具不是配角，而是高胜率主线之一。

公开获奖例子：

- [Seer](https://arena.colosseum.org/projects/explore/seer)：1st Place - Infrastructure
- [Tokamai](https://arena.colosseum.org/projects/explore/tokamai)：2nd Place - Infrastructure
- [IDL Space](https://arena.colosseum.org/projects/explore/idl-space)：Public Goods Award
- [FluxRPC](https://solana.com/news/solana-breakout-winners)：Breakout 2025 Infrastructure 第一

这说明如果你的项目能显著提升 builder UX，而且 demo 足够直观，是完全有头奖可能的。

### 4. 稳定币支付是强主线，但“纯支付 App”已经很挤

支付和稳定币是历史获奖高频方向之一，但同时也是最拥挤的方向之一。

明显的得奖和加速器样本包括：

- [CargoBill](https://arena.colosseum.org/projects/explore/cargobill)
- [Decal](https://arena.colosseum.org/projects/explore/decal-payments-and-loyalty)
- [LocalPay](https://arena.colosseum.org/projects/explore/localpay)
- [Credible Finance](https://arena.colosseum.org/projects/explore/credible-finance-1)
- [Remlo](https://arena.colosseum.org/projects/explore/remlo)

所以你如果只是再做一个：

- merchant checkout
- QR stablecoin wallet
- remittance app
- invoicing/payroll app

你面对的不是“没人做过”，而是已经有获奖项目和 accelerator 公司。

## 当前公开讨论区在讨论什么

### 1. 官方论坛正在讨论“钱包里的人类可读审批”

[sRFC 36 - Typed Message Payload Rendering in Wallets](https://forum.solana.com/t/srfc-36-typed-message-payload-rendering-in-wallets/3678) 发布于 **2025-03-27**，核心意思很明确：

- DeFi 和复杂链上交互的 UX 需要更好
- 用户不应该面对原始 hex / borsh
- 钱包应该能把签名内容渲染成 **人类可读的消息预览**
- 这样才能支撑更好的 gasless / sign-message / delegated execution 体验

这个讨论对你的意义很大：

**它说明“typed approvals / wallet-readable intent”不是我拍脑袋想出来的，而是 Solana 官方公开讨论里的真需求。**

### 2. 官方文档已经把支付场景写得非常明确

[Solana Payments 文档](https://solana.com/hi/docs/payments) 当前明确写了这些点：

- 2025 年 Solana 处理了 **超过 `$1 trillion` 的稳定币交易量**
- 官方直接列出的支付场景包括：`remittances`、`treasury optimization`、`global payouts`、`cross-border payments`、`merchant acceptance`、`invoices`
- 官方强调的 Solana 优势包括：
  - `~400ms` 级确认
  - `~$0.001` 级费用
  - local fee markets
  - memos for reconciliation
  - sponsor / abstract network fees，让用户不需要先买 SOL

这几乎等于明示：

**稳定币支付不是边缘赛道，而是官方正在推的主赛道。**

### 3. Solana Foundation 在 2026 年把支付 API 化、企业化了

[Solana Foundation Launches Solana Developer Platform](https://solana.com/news/solana-developer-platform) 发布于 **2026-03-24**，这是当前最关键的一条信号。

文中直接写：

- SDP 是一个 **AI-ready** 的开发平台
- `Payments module` 支持 `B2B`、`B2C`、`P2P`
- 它支持 `on-ramp`、`off-ramp`、stablecoin onchain transactions
- 早期用户包括：
  - `Mastercard`
  - `Worldpay`
  - `Western Union`

这对你的含义是：

- 官方已经不再把支付理解成“单个钱包功能”
- 而是理解成 **一组 API 驱动、企业可接入、可编排的金融能力**
- 所以你做“支付操作层 / policy layer / orchestration layer”，是顺着官方路线走

### 4. RFP 板块显示官方也在明确要开发者工具

[Solana Developer Forums 的 RFP 分类](https://forum.solana.com/c/rfp/10) 当前公开显示的题目包括：

- `Indexer tooling`
- `Discriminator Database`
- `Post-Deployment Monitoring Tooling`
- `Solana Historical State Verification Tool`

这说明：

- 开发者工具不是“自嗨”
- 是 Solana 生态明确存在 funding / demand 的方向

### 5. 当前公网可见的 Colosseum 项目偏向 agentic payments / treasury / infra

截至 2026-03-31，Colosseum 当前公开页面已经明显带有 Agent Hackathon 气氛。当前公开项目里可以看到的方向包括：

- `Karma Card`：agentic credit card / payments
- `StableGuard`：agentic risk / treasury
- `Sentience`：autonomous treasury / yield

这反过来说明两件事：

1. **Agent + payments** 是现在很热的方向
2. 如果你只是做一个泛泛的 agent treasury 或 agent wallet，就很容易撞车

所以更好的打法是：

**做 AI-enabled，但不要做 AI-wrapper。**

## 候选方向对比

### 方向 A：纯稳定币支付 App

例子：

- CargoBill
- Credible Finance
- LocalPay
- Decal
- Remlo
- MISK.FI

优点：

- 评委容易懂
- demo 直观
- 有市场验证

缺点：

- 太拥挤
- accelerator overlap 明显
- 很容易被评委归类为“another payments app”

我的评分：

- 赛道热度：`9/10`
- 差异化难度：`4/10`
- 获奖概率：`6/10`

### 方向 B：纯开发者监控 / 调试 / Indexer 工具

例子：

- Seer
- Tokamai
- IDL Space
- Ionic

优点：

- 和官方 RFP 对齐
- 技术深度强
- 有 Infrastructure 头奖 precedent

缺点：

- demo 虽然强，但更偏 developer audience
- 若没有特别强的视觉化或新机制，容易被当作“another devtool”
- 直接竞品已经不少

我的评分：

- 赛道热度：`8/10`
- 差异化难度：`6/10`
- 获奖概率：`7/10`

### 方向 C：PolicyPay，稳定币支付操作层 + Typed Approval + Gasless Relayer + Agent Assist

它不是 A 的支付 App，也不是 B 的纯 devtool，而是两者交叉。

优点：

- 对齐当前官方三条最强信号：
  - 支付 API 化
  - typed message / wallet-readable approvals
  - agent-ready builder stack
- 能投多个评审视角：
  - Infrastructure
  - Stablecoins / Payments
  - AI / Agents（如果今年赛制支持）
- 技术深度强，但 demo 也足够直观
- 有很清晰的商业化路径

缺点：

- 设计边界要控制，否则容易做太大
- 需要你在架构和故事上保持聚焦

我的评分：

- 赛道热度：`9/10`
- 差异化难度：`8/10`
- 获奖概率：`8.5/10`

## 为什么我最终推荐 PolicyPay

### 1. 它踩中了“已验证需求”，但没有踩进最拥挤的一层

当前最拥挤的层是：

- wallet
- remittance app
- QR pay app
- merchant checkout
- payroll / invoice app

你如果进入这些层，天然会被拿来和 CargoBill、Credible、Decal、LocalPay、Dollar 之类做比较。

PolicyPay 则往下一层走：

**不是支付产品本身，而是让支付产品和 agent / treasury / finance team 真能运行的操作层。**

### 2. 它把今年最强的几个信号绑到了一起

- Solana 官方文档在推 payments
- Solana Foundation 在推 API-driven payments platform
- 论坛在推 typed message rendering
- 当前黑客松气氛偏 AI / Agent

PolicyPay 恰好是这四条线的交点。

### 3. 它容易讲出“为什么只有 Solana”

你可以非常自然地说：

- 需要 sub-cent fee
- 需要快确认
- 需要 batch payouts
- 需要 memos 做对账
- 需要 gas abstraction
- 需要账户模型支持灵活 policy / PDA / relayer

这比很多“AI 产品上 Solana”的故事更合理。

### 4. 它既能拿 track prize，也有 public goods 机会

如果你把核心做成：

- 开源的 typed-intent SDK
- 开源的 relayer / paymaster spec
- 一个参考 dashboard

那它不仅像 track 项目，也像 public goods 项目。

## 推荐项目定义

### 项目名

**PolicyPay**

### 一句话介绍

**PolicyPay 是一个面向稳定币支付和 Agent 支付流程的 Policy Layer：AI 或后台先创建付款意图，人类在钱包里看到可读审批并签名，Relayer 按策略执行 gasless 结算，并把全程审计日志写回系统。**

### 目标用户

第一阶段只服务三类用户：

- 使用 USDC 进行跨境付款的小团队和中小企业
- 需要批量付款和审批流的 DAO / protocol ops 团队
- 想给 AI Agent 开放链上支付能力，但又不敢完全放权的 builder

### 核心问题

今天稳定币支付不是“没法转”，而是“很难运营”：

- 发票和 payout 意图来自链下系统
- 钱包签名内容对财务人员不友好
- 对方经常没有 SOL
- Agent 可以发起动作，但不能直接拿资金权限
- 财务和合规需要审计轨迹、memo、审批记录
- 批量付款和失败重试体验很差

### 核心价值

PolicyPay 提供四件事：

1. **Intent API**
   - 创建 invoice、payout、batch settlement、refund、escrow release

2. **Typed Approval**
   - 把要签的动作变成钱包可读的审批消息
   - 不是一串看不懂的 bytes

3. **Relayer / Paymaster**
   - 用户批准后，Relayer sponsor gas 并提交交易
   - 用户或供应商不需要提前准备 SOL

4. **Audit + Policy**
   - 每个动作都挂在 policy 下执行
   - 记录发起人、审批人、金额上限、白名单、memo、执行结果

## 产品边界

### 你这次 hackathon 不做什么

为了提高胜率，必须刻意不做以下内容：

- 不做法币出入金集成
- 不做完整 KYC 平台
- 不做跨链
- 不做通用 MPC 钱包
- 不做全功能 ERP
- 不做复杂 AI 自动交易

### 你这次 hackathon 必须做出来的最小闭环

必须有这 6 个模块：

1. 后台创建 payment intent
2. Agent 或规则引擎建议付款动作
3. 人类通过 typed approval 审批
4. Relayer 代付 gas 并执行 USDC 转账
5. memo / reference 写入链上，支持对账
6. dashboard 展示状态、失败重试和审计日志

只要这 6 个点完成，故事就完整了。

## Demo 场景设计

你应该只讲一个故事，不要讲十个故事。

我建议你 demo 这个场景：

### 场景：一个面向跨境 freelancer / vendor 的 USDC 结算后台

流程如下：

1. 公司在后台导入 3 个待付款项目
2. AI 助手读取自然语言说明或简化版 invoice，自动生成付款草案
3. 系统根据 policy 检查：
   - 金额是否超预算
   - 对方地址是否在 allowlist
   - memo 是否完整
4. 财务负责人在钱包里看到可读审批：
   - 支付给谁
   - 支付多少 USDC
   - 对应哪张 invoice
   - 批次编号是什么
5. 财务点击 approve
6. Relayer sponsor gas，批量把 USDC 发出去
7. dashboard 显示：
   - `approved`
   - `submitted`
   - `confirmed`
   - `failed / retry`
8. 导出带 memo 的结算记录

这个 demo 能同时打中：

- 支付
- 稳定币
- enterprise ops
- gasless UX
- AI assist
- policy + auditability

## 技术架构

### Onchain

建议一个 Anchor program，包含这些 PDA：

- `PolicyAccount`
  - owner
  - allowedExecutors
  - allowedRecipients
  - dailyLimit
  - perTxLimit
  - allowedMint
  - requireMemo

- `PaymentIntent`
  - creator
  - recipient
  - mint
  - amount
  - reference
  - memo
  - status
  - expiry
  - policy

- `ApprovalRecord`
  - approver
  - approvedAt
  - approvalHash
  - intent

- `ExecutionRecord`
  - relayer
  - txSig
  - executedAt
  - result

### Offchain Relayer

一个 TypeScript service 即可：

- 接收已审批 intent
- 检查 policy
- 估算 compute / priority fee
- sponsor gas
- 发送交易
- 回写执行结果
- 失败重试
- 推送 webhook

### Wallet / Approval Layer

你不需要等所有钱包都支持 sRFC 36 才能做。

hackathon 版本可以这样做：

- 主路径：使用 typed payload + signMessage + 自定义 human-readable preview
- Fallback：在前端生成清晰的审批卡片，然后签名结构化消息
- 如果钱包支持更好的 typed rendering，就展示增强版

关键不是“等标准完全落地”，而是：

**你要证明这个 UX 路径是对的。**

### Frontend

一个 Next.js dashboard 足够：

- intents 列表
- 审批队列
- batch payout 页面
- execution log
- policy editor

### AI Layer

AI 只做两个事情：

1. 从 invoice / 文本说明生成 payout draft
2. 给出 policy violation summary

不要让 AI 去直接控制资金。

这是很重要的产品立场：

**AI 负责提议，人类负责批准，程序负责执行。**

这比“autonomous treasury agent”更容易被评委接受，也更安全。

## 为什么这比“全自动 Agent”更强

因为现实世界里最贵的不是转账本身，而是：

- 谁发起
- 谁批准
- 谁担责
- 出错怎么追溯

所以完全自动化很酷，但：

- 风险大
- 审批逻辑弱
- 商业落地难

PolicyPay 的优点是：

- 有 AI 的酷感
- 但又有财务和合规的现实约束
- 更像一个真的会被企业采用的产品

## 和现有项目的差异化

### 相比 CargoBill / Credible / LocalPay / Decal

它们更像：

- payment rail
- remittance app
- merchant payments
- vertical payments product

PolicyPay 更像：

- payment operations layer
- approval + intent + audit layer
- 给企业和 agent 用的 orchestration infra

### 相比 Lazor Kit / OTAC / Unruggable

它们更像：

- wallet infra
- onboarding primitive
- security / account abstraction layer

PolicyPay 不做“另一个钱包”，而是用这些思想服务稳定币运营工作流。

### 相比 Seer / Tokamai / IDL Space

它们更像：

- debugger
- monitor
- devtool

PolicyPay 虽然也有 infra 属性，但更接近：

- 可直接跑业务的 payment ops product
- 带 public goods 属性的 developer/payment SDK

## 2026 年如果你参加的是 Agent Hackathon，怎么讲这个故事

当前公网信息显示 2026 年 Colosseum 已经在跑 Agent Hackathon 氛围，所以你最好准备一个 agent 版本的 pitch。

最好的 framing 不是：

- “AI 帮你发钱”

而是：

- **“让 AI 获得可控的支付能力”**

你的 pitch 可以这样说：

> AI agents can generate payment intents, but enterprises still need policy checks, human-readable approvals, gas abstraction, and auditable execution. PolicyPay is the control plane that makes agentic payments safe on Solana.

这比泛 agent 钱包、泛 treasury agent、泛 yield agent 更稳。

## 建议提交赛道

如果 2026 年赛道命名和 2025 年相近，我建议排序如下：

1. `Infrastructure`
2. `Stablecoins` / `Payments`
3. `AI` / `Agents`

原因很简单：

- 这个项目的主胜点是 infrastructure 深度
- 稳定币和支付让它更容易被理解
- AI 只是增强项，不应该反客为主

## 14 天实施计划

### Day 1-2

- 明确单一 demo 场景
- 画出 intent / approval / execution 状态机
- 定义账户结构和事件

### Day 3-5

- 写 Anchor program
- 做 `createIntent`
- 做 `approveIntent`
- 做 `executeIntent`
- 做 memo / reference 支持

### Day 6-7

- Relayer / paymaster service
- 状态回写
- 失败重试
- 批量 payout

### Day 8-9

- Dashboard：intent list、approval queue、execution log
- Wallet flow：approval UI

### Day 10

- Solana Actions / pay link
- 一键 approve / pay 页面

### Day 11

- AI draft generation
- policy summary / violation explanation

### Day 12

- polish
- dummy data
- edge case
- loading / error state

### Day 13

- 录技术 demo
- 录产品 demo
- 写 README

### Day 14

- 压缩 pitch
- 提交材料
- rehearse 3 次

## Demo 视频脚本

把视频控制在 3-4 分钟。

### 开头 20 秒

- Stablecoin payments work on Solana
- Stablecoin operations still do not
- Agentic finance makes this harder, not easier

### 第 1 分钟

- 创建 payout batch
- AI 解析 invoice / payout note
- 自动生成 3 个 intents

### 第 2 分钟

- CFO 打开钱包审批
- 钱包中显示人类可读的 typed approval
- approve

### 第 3 分钟

- relayer sponsor gas
- batch settlement 成功
- dashboard 显示 memo、状态、tx hash
- 导出 reconciliation 记录

### 结尾 20 秒

- PolicyPay is the control plane for stablecoin operations and agentic payments on Solana

## Pitch 里必须强调的 6 个点

1. **不是 another wallet，不是 another remittance app**
2. **解决的是支付运营层，不是支付转账层**
3. **Solana 的 fee abstraction、memo、fast finality、batch execution 是核心优势**
4. **typed approval 解决现实里的审批 UX 问题**
5. **AI 负责生成意图，不直接控制资金**
6. **可以开源核心 SDK，兼具 public goods 属性**

## 你不应该做的版本

### 不推荐版本 1

“一个 AI 代理自动帮企业做 treasury 和 yield”

问题：

- 太像当前热门 agent 项目
- 风险太大
- 故事不稳

### 不推荐版本 2

“一个面向所有人的稳定币支付钱包”

问题：

- 太挤
- 区分度不够
- 评委已经见过很多次

### 不推荐版本 3

“一个 Solana debugger / monitor”

问题：

- 方向对，但已经有 Seer / Tokamai / IDL Space
- 你需要非常强的新机制才有优势

## 商业化路径

PolicyPay 不只是 hackathon demo，也有真实商业路径：

- 向 SaaS / fintech / DAO ops 团队收平台费
- 对 relayer / paymaster 收 usage fee
- 对 enterprise dashboard 收 seat fee
- 对 API / webhook / audit export 收 subscription fee

最先可切的市场：

- remote teams
- crypto-native service providers
- small cross-border businesses
- AI agent builders

## 为什么这个方向的拿奖概率高

我的最终判断是：

- **不是因为它完全没人做过**
- 而是因为它站在一个评委熟悉、但还没有被最优解占领的位置上**

更具体地说：

- 它借用了稳定币赛道已经被验证的需求
- 它借用了 infra 赛道已经被验证的评审偏好
- 它吸收了 agent 赛道当前的热度
- 但它没有直接落到最拥挤的 product surface

这是很少见的组合。

## 最终建议

如果你只做一个项目，就做 `PolicyPay`。

如果你必须进一步缩 scope，就把它砍成这个版本：

**一个支持 typed approvals 和 gasless execution 的 USDC payout/invoice orchestration layer，附带一个最小 AI draft assistant。**

这是我认为截至 **2026-03-31**，最接近“可做、可讲、可赢”的 Solana hackathon 项目方向。

## 关键参考

- [Colosseum 官网：next hackathon is happening now](https://colosseum.com/)
- [Colosseum Get Started：每年两次 hackathon](https://www.colosseum.com/get-started)
- [sRFC 36 - Typed Message Payload Rendering in Wallets](https://forum.solana.com/t/srfc-36-typed-message-payload-rendering-in-wallets/3678)
- [Solana Payments 文档](https://solana.com/hi/docs/payments)
- [Solana Foundation Launches Solana Developer Platform](https://solana.com/news/solana-developer-platform)
- [Solana Developer Forums RFP 分类](https://forum.solana.com/c/rfp/10)
- [CargoBill](https://arena.colosseum.org/projects/explore/cargobill)
- [Seer](https://arena.colosseum.org/projects/explore/seer)
- [One-Time Action Codes](https://arena.colosseum.org/projects/explore/one-time-action-codes-1)
- [Lazor Kit](https://arena.colosseum.org/projects/explore/lazor-kit-1)

## 备注

- 大多数 hackathon 项目最后不会变成成功公司；这里列出的项目主要用于看“别人尝试过什么”和“评委奖励什么”。
- 这里引用的部分项目可能已经不再活跃；如果你要做竞品分析，最好在提交前再检查一次当前状态。
