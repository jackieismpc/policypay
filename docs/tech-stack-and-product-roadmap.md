# PolicyPay 技术栈决策、产品重构与 AI-native 路线

版本：v2.0  
日期：2026-04-05

## 1. 文档目标

这份文档不再把 PolicyPay 定义为“带一点 AI 的企业支付后台”。

从现在开始，它承担三件事：

- 基于当前代码实况，说明我们已经真正做成了什么
- 明确指出当前产品为什么还不够有创新性，也还不够可投产
- 把 PolicyPay 重新定义为一个 **Solana-first、AI-native、可审计、可执行的人机协作支付底座**

一句话结论：

> **PolicyPay 不应该只是给人点按钮的业务系统，而应该是让 AI 负责理解、编排、风控、执行建议与异常处理，人类只做审阅与授权的支付控制平面。**

## 2. 基于代码的现状盘点

以下是仓库中已经落地、且能从代码直接确认的能力。

### 2.1 已实现的核心能力

- 链上程序采用 `Rust + Anchor`
- 已实现 `PolicyAccount`、`PaymentIntent`、`BatchIntent` 三类核心账户
- 单笔付款单支持状态流转：
  - `Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批量付款支持：
  - 创建批次
  - 添加明细
  - 提交审批
  - 审批
  - 取消
- Policy 约束已支持：
  - 金额上限
  - 收款白名单
  - Memo 必填
- 默认后端已经收口到 `services/policypay-api-rs`
- 对外 API 已统一为 `/api/v1/*`
- 已提供业务最小输入接口：
  - `POST /api/v1/intents/minimal`
  - `POST /api/v1/batches/minimal`
- 后端可自动生成技术字段：
  - `intentId`
  - `batchId`
  - `reference`
- 已实现幂等、审计日志、执行记录、时间线记录、健康检查、OpenAPI
- 默认 Dashboard 已接入 Rust 统一入口，可供非技术用户演示和操作
- `modules/domain` 已提供跨模块领域合同
- `modules/agent-adapter` 已实现 CSV / 自然语言草稿解析，并强制 `requiresHumanApproval=true`

### 2.2 已实现但仍然只是“流程模拟”或“半成品”的部分

- 单笔经典 SPL 结算链路已经打通：`POST /api/v1/intents/:intentId/execute` 会完成真实转账，并把执行结果写入链上状态、`/executions*` 与 `/timeline`
- 当前真实结算仍然只覆盖单笔经典 SPL；`Token-2022`、批量真实结算、更多路由策略还没有完成
- `modules/agent-adapter` 目前只是独立模块和测试，**没有进入默认对外 API 主路径**
- 现有 AI 相关内容大多还停留在文档愿景，**没有模型适配层、结构化输出校验、风险引擎、审批摘要主链路**

### 2.3 当前最关键的缺口

如果以“真实可投产的 AI 时代支付产品”来要求自己，现在还缺少以下基础能力：

- 更完整的真实 Solana 资产执行层：在已落地的单笔经典 SPL 基础上，补齐批量、Token-2022 与更灵活的 settlement route
- 面向 agent 的预算、授权、限额、撤销与责任归属机制
- 面向 agent / 商户 / 企业的钱包身份与信任层
- 统一的 AI intake / compiler / review pack 流程
- 合规证明、可复用凭证、可验证风控结论
- 面向 API / MCP / x402 的 machine-to-machine 支付接口

## 3. 为什么当前产品还不够创新

当前版本的问题不在于“代码太少”，而在于“产品定义偏窄”。

### 3.1 现在更像一个企业 AP 流程系统，而不是 AI 时代的支付基础设施

当前主叙事仍然是：

`付款单创建 -> 审批 -> 提交 -> 状态追踪`

这在企业内部流程里是有价值的，但它本质上仍然是一个 **支付业务系统**，不是 **支付基础设施**。

如果我们停在这里，产品会有三个天花板：

- 只能服务“人类手动发起、手动审核、手动处理异常”的流程
- AI 只能做边缘助手，而不是核心生产力
- 无法接住 AI agent、API economy、MCP、x402、agent marketplace 这些正在形成的新支付场景

### 3.2 AI 现在没有进入“支付主链路”

真正有创新性的 AI-native 支付产品，AI 不应该只是：

- 聊天入口
- 文案生成器
- 风险提示弹窗

AI 应该进入主链路，负责：

- 读取自然语言 / 发票 / 订单 / API 请求
- 编译出结构化支付意图
- 匹配策略、预算、权限和收款人画像
- 给出可解释的风险与审批建议
- 选择执行路径
- 在失败后进行归因、补救与二次编排

也就是说，**AI 不应该是 UI 上的一块插件，而应该是支付控制平面里的编译器、分析器和调度器。**

### 3.3 当前没有建立“agent 可以安全花钱”的底层机制

AI 时代的支付，不只是“让 AI 帮人发起付款”。

更重要的是：

- 让 agent 在授权边界内代表人类或企业花钱
- 让 agent 可以购买 API、数据、算力、服务、商品
- 让人类可以审阅 agent 的支付理由、证据、预算消耗和预期结果
- 让企业可以在不暴露敏感凭证和资金控制权的前提下，让 agent 参与商业流程

这要求产品从一开始就具备：

- 委托授权
- 可撤销预算
- 身份证明
- 信誉与验证
- 审计与争议处理

这些还不是现有版本的中心能力。

## 4. 新的产品定义

### 4.1 最终形态

PolicyPay 的目标形态应当是：

> **面向人类与 AI agents 的支付编排与执行底座。**

它的作用不是把链上支付包装成一个 Dashboard，而是把“支付”抽象成一个可被 AI 理解、被策略约束、被人类审阅、被系统执行、被审计重放的标准化过程。

### 4.2 核心工作流

新的标准流程应该是：

`输入 -> 意图编译 -> 策略匹配 -> 风险与信任校验 -> 执行方案生成 -> 人类审阅/授权 -> 链上/链下执行 -> 自动归因与修复`

其中：

- 输入可以来自人类、API、CSV、自然语言、发票、MCP 工具调用、agent 请求
- AI 负责把非结构化输入编译为规范化支付意图
- 策略系统负责判断是否允许、需要哪些证明、预算是否足够、是否必须升级审批
- 执行层负责选路与落地
- 人类只在关键节点做审阅和授权
- 审计系统记录每一步证据，保证可复盘和可追责

### 4.3 这意味着什么

这意味着：

- “付款审批后台”只是产品的一个表层界面，不再是产品定义本身
- “AI 助手”不是附属功能，而是主流程中的控制逻辑
- “支付”不再只等于一次转账，而是一个由策略、身份、预算、执行和证明组成的完整协议栈

## 5. Solana 生态信号：我们应该顺着什么方向做

以下不是泛泛而谈的灵感，而是 2024-2026 年 Solana 生态已经明确释放出来的方向信号。

### 5.1 支付正在从“钱包转账”升级到“真实商业流”

- 2025-07-02，Colosseum 公布 [Solana Breakout Hackathon](https://blog.colosseum.com/announcing-the-winners-of-the-solana-breakout-hackathon/) 结果，稳定币赛道的代表项目包括：
  - CargoBill：供应链稳定币支付
  - LocalPay：新兴市场稳定币支付
  - Xelio：通过短信完成全球汇款与支付
  - Decal：支付与数字忠诚度平台
- 这说明市场已经不满足于“加密钱包转账”，而是在要：
  - 供应链支付
  - 本地支付接入
  - 跨境汇款
  - 商户与消费场景

### 5.2 支付正在和 MCP / x402 / AI agent 合流

- 2025-12-13，Colosseum 公布 [Solana Cypherpunk Hackathon](https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/) 结果，稳定币赛道的代表项目包括：
  - MCPay：连接 MCP 与 x402 的开放支付基础设施
  - Mercantill：面向 AI agents 的企业银行基础设施
  - Sp3nd：让 Amazon 商品支持稳定币支付
- 2026-03-19，Colosseum 在 [Agent Hackathon Winners](https://blog.colosseum.com/agent-hackathoin-ptoken-seeker-grants/) 中明确把 agent 作为独立产品类别，并点名了 `StableGuard` 等方向
- 这说明“agent 会不会花钱”已经不是未来命题，而是正在形成产品与标准的现实问题

### 5.3 Solana 官方已经把企业支付定义为 API-first 基础设施

- 2026-03-24，Solana Foundation 发布 [Solana Developer Platform](https://solana.com/news/solana-developer-platform)
- 这个平台把能力抽象成 `Issuance / Payments / Trading` 三个 API 模块，并明确服务对象是企业与金融机构
- 这意味着官方路线不是“做一个钱包 UI”，而是：
  - API-first
  - orchestration-first
  - compliance-ready
  - partner-aggregated

### 5.4 Agentic payments 正在从产品实验变成开放标准

- Solana 官方文档已经单列 [Agentic Payments](https://solana.com/docs/payments/agentic-payments)
- Solana 官方已推出 [x402](https://solana.com/x402/what-is-x402) 相关页面，明确把 HTTP 402 + 稳定币微支付作为 AI agent 经济的重要底座
- 2026-04-02，Linux Foundation 宣布成立 [x402 Foundation](https://www.linuxfoundation.org/press/linux-foundation-is-launching-the-x402-foundation-and-welcoming-the-contribution-of-the-x402-protocol)
- 这说明 x402 已经从“单个团队的尝试”走向开放标准治理

### 5.5 信任、身份、凭证与隐私已经成为支付基础设施的一部分

- Solana 官方已推出 [Agent Registry](https://solana.com/agent-registry/what-is-agent-registry)，把 agent identity、reputation、validation 作为基础设施
- 2025-05-23，Solana Foundation 上线 [Solana Attestation Service](https://solana.com/news/solana-attestation-service)，把可复用 KYC/KYB/资格证明带到链上
- `payments.org` 已经把 [Payments live on Solana](https://payments.org/) 叙事从“链更快”升级到：
  - 企业支付
  - 合规隐私
  - 稳定币流动性
  - Agentic Payments
- 2026-04-03，Colosseum 报道 [Umbra SDK / MagicBlock Private Payments API](https://blog.colosseum.com/umbra-sdk-magicblock-private-payments-x402/)，进一步说明“隐私 + 合规 + agent 可调用”正在汇合

### 5.6 我们对这些信号的解读

这些信号汇总起来，结论很明确：

- **支付主战场已经从“用户手动转账”升级到“程序化商业流”和“agentic commerce”**
- **企业级产品形态已经从“钱包产品”升级到“支付编排 API + 信任层 + 合规层 + 执行层”**
- **AI 真正有价值的地方不是聊天，而是把复杂支付工作流编译成可执行、可验证、可审阅的对象**

## 6. PolicyPay 的目标架构

新的 PolicyPay 不应该再只有 `Policy + Intent + Dashboard`。

它应该由五层组成。

### 6.1 Intent Intake & Compiler

职责：

- 接收自然语言、CSV、发票、ERP webhook、API 请求、MCP 调用
- 统一编译为规范化 `Payment Intent Graph`
- 输出结构化字段、风险候选项、缺失字段、冲突点、建议路由

AI 在这一层负责：

- 语义抽取
- 供应商 / 收款人解析
- 票据归并
- 字段标准化
- 意图分类

### 6.2 Policy & Trust Plane

职责：

- 预算、限额、角色、审批链
- 收款人白名单 / 黑名单 / 类别策略
- Agent 身份、信誉、验证状态
- KYC/KYB/地区/资质/设备等 attestation 检查

这层决定的不是“按钮是否可以点击”，而是：

- 这笔钱能不能花
- 谁能发起
- 谁能批
- AI/agent 是否具有可接受的可信度
- 缺少哪些证明才可以进入执行

### 6.3 Settlement Router

职责：

- 为同一个支付意图选择执行路径
- 支持：
  - 直接 Solana USDC / SPL 转账
  - 批量支付
  - x402 / MCP pay-per-call
  - 商户 / SaaS / API 支付
  - 后续跨境 payout / off-ramp 集成

它的核心不是“发交易”，而是“选路 + 模拟 + 执行 + 失败回退”。

### 6.4 Review Workbench

职责：

- 把 AI 的理解结果、风险判断、预算消耗、执行方案、证据材料压缩成一份 **审阅包**
- 人类不需要重新理解全流程，只需要判断：
  - AI 是否理解对了
  - 风险是否可接受
  - 是否批准

这才是 AI 与人类的最佳协作边界。

### 6.5 Observability, Recovery & Proofs

职责：

- 时间线
- 审计日志
- 执行证明
- 对账
- 失败归因
- 自动修复建议

最终交付给企业的不是一个“操作台”，而是：

- 一个 **可执行**
- **可验证**
- **可归责**
- **可恢复**

的支付系统。

## 7. 技术栈最终决策

### 7.1 不需要推倒重写的部分

这些部分应该保留并继续演进：

- `Rust + Anchor` 链上状态机
- `Policy / Intent / BatchIntent` 作为核心领域对象
- Rust Unified API 作为唯一默认入口
- SQLite 开发模式与模块化存储边界
- 审计、幂等、时间线、领域合同这些基础设施

结论：

> **不需要推翻当前的 onchain 基元；需要推翻的是当前把产品定义成“支付流程后台”的认知。**

### 7.2 必须重构的部分

以下内容必须重构，否则产品无法进入 AI-native 阶段：

- 把“模拟执行层”重构为“真实结算路由层”
- 把 `agent-adapter` 从独立工具升级为统一 API 中的 intake/compiler 服务
- 把 Dashboard 从“表单后台”升级为“审阅与证据工作台”
- 把 AI 从愿景文档拉进真实 API 路径
- 把身份、凭证、信任、预算和授权纳入统一领域模型

### 7.3 默认技术栈建议

- Onchain：
  - `Rust + Anchor`
- Control Plane：
  - `Rust + tokio + axum`
- AI：
  - `provider adapter + prompt template + schema validator + policy-aware orchestration`
- Data：
  - 开发默认 SQLite
  - 生产切换 PostgreSQL
- Frontend：
  - 继续保留轻量 web console，但定位改为 review console
- TypeScript：
  - 保留前端、测试、脚本、适配器
  - 不再承担默认后端核心编排

## 8. 分阶段路线

### 8.1 第一阶段：Solana 可真实接入、可真实执行的 MVP

这是当前最重要的阶段，也是“能不能真正投入使用”的分水岭。

#### 阶段目标

把 PolicyPay 从“支付流程 demo”升级为“Solana 上可真实执行的 AI-assisted payment control plane”。

#### 必须交付

- 支持真实 Solana 资产结算：
  - 先以 `USDC on Solana` 为第一优先级
  - 至少完成一条真实可用的 SPL / Token-2022 支付路径
- 把执行层从模拟改成真实 route：
  - `simulate -> approve -> sign -> submit -> confirm -> reconcile`
- Policy 升级为 `Policy v2`，至少纳入：
  - 资产类型
  - 出款钱包 / 金库来源
  - 预算周期与额度
  - 收款人类别 / 白名单
  - Memo / invoice / attestation 要求
  - agent 是否允许代表执行
- 接入 AI intake：
  - 自然语言 / CSV / invoice -> draft intent
  - 输出结构化字段、风险等级、缺失字段、解释原因
- 接入 AI review pack：
  - “AI 识别到什么”
  - “为什么建议通过 / 拒绝 / 升级审批”
  - “预计走哪条路”
  - “余额、手续费、风险点、策略命中项”
- 人工审批前置必须保留：
  - 阶段一不允许 AI 绕过人工审批直接花钱
- 交付一套真实可演示的 Solana 工作流：
  - 创建意图
  - 风险审阅
  - 人工批准
  - 真实转账
  - 审计与回放

#### 阶段完成标准

满足以下条件，才算阶段一完成：

- 不是模拟执行
- 不是只改状态机
- 不是只有 Dashboard
- 不是只有 AI 输入框
- 可以真实在 Solana devnet / mainnet-beta 指定环境完成一笔受策略约束的 USDC 支付

### 8.2 第二阶段：Agent Payment Rail 与 x402 / MCP 接入

在第一阶段打通真实 Solana 结算后，第二阶段才进入 agent-native 支付层。

#### 目标

让 PolicyPay 不仅服务人类审批流，也服务机器到机器支付。

#### 交付

- x402 buyer / seller 能力
- MCP server monetization / tool-call payment
- agent 预算授权与额度撤销
- 对接 Agent Registry：
  - agent identity
  - capability declaration
  - reputation / validation signals
- 服务类支付场景：
  - API
  - data feed
  - inference
  - SaaS / MCP 工具

#### 结果

届时 PolicyPay 不再只是“企业付款系统”，而是：

- 人类付款
- agent 付款
- agent 代表人类付款
- 人类审阅 agent 付款

都能用的一套统一控制平面。

### 8.3 第三阶段：隐私、合规与全球化支付扩展

#### 目标

把产品从“Solana 支付控制平面”扩展成“全球化 AI-native payment infrastructure”。

#### 交付

- SAS / KYC / KYB / jurisdiction attestation 接入
- 隐私支付能力：
  - selective disclosure
  - confidential transfer / private payment connectors
- payout / remittance / merchant / off-ramp 扩展
- 多路由优化：
  - 成本
  - 时延
  - 风险
  - 合规约束

## 9. 对当前代码库的具体动作建议

### 9.1 继续保留

- `programs/policy_pay`
- `services/policypay-api-rs`
- `modules/domain`
- 现有审计、幂等、时间线相关结构

### 9.2 尽快重构

- `services/policypay-api-rs` 中的执行层
- `modules/agent-adapter` 的接入方式
- Dashboard 的产品定位与交互结构

### 9.3 冻结或降级为兼容遗留

- `services/control-plane`
- `services/indexer`
- `services/relayer`

这些模块可以保留作参考或测试辅助，但不应继续代表未来主架构。

## 10. 最终决策结论

- 不需要推翻当前的链上状态机基元
- 需要推翻当前把产品定义成“企业支付流程后台”的叙事
- PolicyPay 的正确方向不是“多加几个 AI 功能”，而是把 AI 放进支付控制平面的中心
- 第一阶段必须先把 **Solana 真实支付执行** 做出来
- 在此基础上，再扩展到：
  - x402
  - MCP
  - Agent Registry
  - Attestation
  - 隐私与合规

最终我们要交付的，不是一个“AI 帮你填表”的应用，而是一个：

- 面向人类与 AI agents
- 以 Solana 为首发结算层
- 以策略、信任、审阅和执行为核心
- 真实可用、真实可审计、真实可扩展

的支付底座。
