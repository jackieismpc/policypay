# PolicyPay 需求、愿景与最终形态

本文档定义 PolicyPay 的产品方向，而不是实现细节。

如果 `02_architecture.md` 回答的是“系统怎么搭”，这份文档回答的是：

- 我们为什么做它
- 它服务谁
- 它必须解决哪些问题
- hackathon 版本应该做到哪里
- 如果继续做下去，它会变成什么

## 1. 产品定义

**PolicyPay 是一个稳定币支付操作层。**

它让团队、企业和 Agent 可以：

- 生成支付意图
- 让人类看到可读审批
- 通过 relayer 完成 gasless 执行
- 保留完整审计记录和策略约束

它不是：

- 又一个钱包
- 又一个 remittance app
- 又一个 ERP
- 又一个自动交易 agent

## 2. 产品愿景

长期愿景：

**让稳定币支付像现代 SaaS 财务操作一样可编排、可审批、可审计、可自动化。**

更具体地说：

- 让人类不需要理解底层 Solana transaction 也能安全审批
- 让 Agent 可以参与资金流，但永远在 policy 和 human approval 之下
- 让企业把稳定币支付从“手工转账”升级成“运营系统”

## 3. 为什么现在适合做

截至 2026-03-31，当前信号非常明确：

- Solana 官方支付文档已经把 `invoices`、`payouts`、`treasury` 作为重点场景
- Solana Developer Platform 发布后，支付能力已经被 API 化、企业化
- 开发者论坛已经开始讨论 `typed message payload rendering`
- 当前 Colosseum 公网氛围明显偏向 `AI / Agent`

这意味着现在不是去证明“稳定币能不能支付”，而是去解决：

**稳定币支付怎样才能进入真实运营流程。**

## 4. 目标用户

## 4.1 Primary Persona：财务负责人 / 运营负责人

他们的需求：

- 批量付款
- 有审批流
- 有对账信息
- 不想看原始 transaction
- 不想要求对方先有 SOL

## 4.2 Secondary Persona：Crypto-native 中小团队

他们的需求：

- 给 freelancer / vendor 付款
- 用 USDC 结算
- 避免手工转账
- 能接入自己的内部系统

## 4.3 Third Persona：Agent Builder

他们的需求：

- 让 AI 帮他们生成结算动作
- 但不想给 AI 无限资金权限
- 需要 human-in-the-loop

## 5. Jobs To Be Done

### JTBD-1

“当我需要给多个供应商付款时，我希望系统能先帮我整理付款草案、做规则检查、再给我可读审批，而不是让我手工在钱包里一个个转账。”

### JTBD-2

“当我让 AI 参与财务操作时，我希望 AI 只负责建议，而不是直接拿走执行权限。”

### JTBD-3

“当一次支付失败时，我希望知道为什么失败、怎么重试，并能在 dashboard 里追踪状态。”

### JTBD-4

“当接收方没有 SOL 时，我希望也能完成支付，而不是因为链上手续费阻塞业务流程。”

## 6. 产品原则

PolicyPay 必须坚持这 6 个原则：

1. **Readable first**
   - 所有关键动作先让人理解，再让人签名

2. **Policy before execution**
   - 任何动作都先过 policy，再进入执行

3. **AI assists, humans approve**
   - AI 只能辅助，不能替代资金授权

4. **Auditability by default**
   - 每次 intent、approval、execution 都有记录

5. **Gasless UX**
   - 尽量不让最终用户为网络费操心

6. **Demo completeness over surface breadth**
   - hackathon 优先做完整闭环，不做大而散

## 7. Hackathon 版本的产品范围

## 7.1 In Scope

- 创建 payment intent
- 创建 batch payout
- policy 校验
- human-readable approval
- relayer sponsor gas
- USDC devnet 执行
- execution log
- 基础 AI draft assistant

## 7.2 Out of Scope

- 法币支付网络
- 真正的银行侧对接
- 多链
- MPC 钱包
- 完整 KYC
- 通用账户抽象协议
- 复杂多组织权限系统

## 8. 功能需求

## FR-001 Intent 创建

系统必须允许用户创建单笔 payment intent。

验收标准：

- 支持金额、接收方、币种、memo、reference
- intent 生成后可进入审批队列

## FR-002 Batch Payout

系统必须支持批量付款意图。

验收标准：

- 同一批次可以包含多笔 payout
- 每笔都能追踪单独状态

## FR-003 Policy 校验

系统必须在 intent 进入审批前执行 policy 检查。

验收标准：

- 至少支持金额上限
- 至少支持接收方白名单
- 至少支持 memo 必填

## FR-004 Human-readable Approval

系统必须在审批阶段生成可读信息，而不是仅展示原始 transaction。

验收标准：

- 审批页面能展示 recipient、amount、mint、memo、reference
- 能明确标记该动作是否由 AI 草拟

## FR-005 Gasless Execution

系统必须支持 relayer sponsor network fee。

验收标准：

- 接收方不需要预先持有 SOL
- demo 中能显示由 relayer 执行

## FR-006 Execution Tracking

系统必须支持执行状态追踪。

验收标准：

- 至少支持 `Approved`、`Submitted`、`Confirmed`、`Failed`
- 每条执行都能看到 tx hash 或等价标识

## FR-007 Retry

系统必须支持最小失败重试机制。

验收标准：

- 失败 intent 能进入重试队列
- 重试不会重复消费已确认 intent

## FR-008 Audit Trail

系统必须保存审批和执行的基本审计日志。

验收标准：

- 记录谁发起、谁批准、何时执行、执行结果

## FR-009 Agent Assist

系统必须允许 AI 生成 payout draft。

验收标准：

- AI 草案不能绕过审批
- 用户能看到 AI 生成的解释文本

## FR-010 Solana-specific Story

系统必须在产品上体现 Solana 特有价值。

验收标准：

- 支持 memo/reference
- 支持低成本高频支付演示
- 明确说明 gas abstraction 路径

## 9. 非功能需求

## NFR-001 可演示性

hackathon 版本必须在 3-4 分钟内讲清楚完整闭环。

## NFR-002 一致性

intent 状态不能出现双写冲突或重复执行。

## NFR-003 可理解性

非开发者也能看懂 UI 中的审批页面。

## NFR-004 可扩展性

未来应能支持二次审批、多组织、多 mint。

## NFR-005 最小依赖

hackathon 版本应尽量依赖成熟基础设施，不重复造 RPC / indexing 轮子。

## 10. 最终形态

如果项目继续做 6-12 个月，最终形态不应该停留在“demo dashboard”，而应该是一个完整的 stablecoin ops platform：

### 10.1 企业控制台

- 组织和成员管理
- policy templates
- batch payout
- approval queue
- audit exports

### 10.2 API Platform

- 创建 intent API
- webhook
- SDK
- embedded approval components

### 10.3 Agent Control Plane

- Agent payout draft
- policy simulation
- human approval handoff
- budget caps

### 10.4 Integrations

- accounting / ERP
- payroll
- invoice systems
- treasury tools

## 11. 用户体验目标

用户体验上，最终产品要做到这三句话：

- “我能看懂我要签什么”
- “我不需要手工准备 SOL 才能完成支付”
- “我知道每一笔钱发生了什么”

## 12. 差异化定位

PolicyPay 的位置不是：

- consumer wallet
- merchant POS
- remittance rail

它的正确定位是：

**the control plane for stablecoin operations**

这是它最重要的定位句。

## 13. 商业化路径

### 起步客户

- crypto-native SMB
- protocol ops teams
- remote-first service firms
- AI agent builders

### 收费方式

- seat-based dashboard fee
- relayer usage fee
- API / webhook fee
- enterprise support fee

## 14. Hackathon 的成功标准

这个项目在 hackathon 里的成功，不是“功能做了很多”，而是下面 5 点：

1. 评委能在 30 秒内理解产品
2. 评委能在 90 秒内看到它和 CargoBill / wallet / agent app 的区别
3. demo 能稳定跑完
4. 技术栈明显是 Solana-native，不是套壳
5. 项目有明确下一步，不像一次性 demo

## 15. 提交时应该如何描述

建议用这段作为产品摘要基础：

> PolicyPay is the stablecoin operations layer for teams and agents on Solana. It turns raw transfers into policy-checked payment intents, human-readable approvals, and gasless audited execution, making stablecoin payouts production-ready instead of manual.

## 16. 结论

PolicyPay 的本质不是“支付”，而是“支付操作系统”。

这是它和大部分支付类项目最大的差别，也是它更可能拿奖的原因：

- 它够具体
- 它够现实
- 它够 Solana
- 它够新
- 它又没有新到让评委听不懂
