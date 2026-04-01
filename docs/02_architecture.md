# PolicyPay 架构文档

截至 2026-03-31，本架构文档对应的产品定义是：

**一个面向团队、企业和 AI Agent 的稳定币支付操作层。链下系统或 Agent 先生成 payment intent，人类在钱包中看到可读审批并签名，Relayer 再按 policy 执行 gasless 交易。**

## 1. 架构目标

这套系统必须同时满足 6 个目标：

1. 支持 `invoice`、`payout`、`refund`、`batch settlement` 等支付操作
2. 把复杂链上交易抽象成 **可读、可审计、可批准** 的 intent
3. 允许人类审批和 AI 辅助共存，但不让 AI 直接持有无限资金权限
4. 支持 `gasless execution`，避免对方必须先持有 SOL
5. 为财务 / 运营 / agent 系统提供完整状态机和审计日志
6. 保持 hackathon 范围内的可实现性，不引入过重的链下依赖

## 2. 系统总览

从系统边界看，PolicyPay 可以拆成 5 层：

1. `Dashboard / Client`
   - 面向财务、运营、商家、Agent operator 的前端

2. `Control Plane API`
   - 管理 payment intents、policies、approvals、logs、webhooks

3. `Policy Engine + Agent Assist`
   - 生成 payout 草案、做规则检查、给出 explainability

4. `Relayer / Paymaster / Indexer`
   - sponsor gas、构造交易、重试、监听链上状态

5. `Solana Program Layer`
   - 管理 intent、policy、approval、execution record 和 vault state

## 3. 高层组件关系

```text
+--------------------+        +---------------------+
| Dashboard / Admin  | -----> | Control Plane API   |
+--------------------+        +---------------------+
          |                              |
          v                              v
+--------------------+        +---------------------+
| Wallet Approval UX | <----> | Policy Engine       |
+--------------------+        +---------------------+
          |                              |
          v                              v
+--------------------+        +---------------------+
| Solana Wallet      |        | Relayer / Indexer   |
+--------------------+        +---------------------+
          \__________________________/
                         |
                         v
                +---------------------+
                | Solana Programs      |
                +---------------------+
```

## 4. 推荐代码库结构

当前仓库只是一个 Rust scaffold。真正进入实现阶段后，建议演进成下面的结构：

```text
policypay/
  Cargo.toml
  README.md
  docs/
  apps/
    dashboard/
    actions/
  crates/
    policy-types/
    policy-client/
    relayer-core/
  programs/
    policy_pay/
  services/
    api/
    relayer/
    indexer/
    agent_assist/
  scripts/
    devnet/
    fixtures/
```

原因：

- `programs/` 放链上程序
- `crates/` 放 Rust 共享逻辑和类型
- `services/` 放真正运行的链下服务
- `apps/` 放用户界面和 Solana Actions endpoint

如果 hackathon 时间紧，可以先不完全拆开，但设计上要按这个目标来。

## 5. 关键模块职责

### 5.1 Dashboard / Client

职责：

- 创建 payment intent
- 展示审批队列
- 展示 policy 命中结果
- 展示 execution 状态
- 展示失败重试和审计日志

不负责：

- 真正执行链上交易
- 资金托管
- 核心规则判断

### 5.2 Control Plane API

职责：

- 保存业务元数据
- 暴露 REST / JSON API
- 管理 organization、workspace、members、policies
- 为前端提供统一读写入口
- 记录非链上审计日志

建议接口：

- `POST /intents`
- `GET /intents/:id`
- `POST /intents/:id/approve-request`
- `POST /policies`
- `GET /executions/:id`
- `POST /batchs`
- `POST /webhooks`

### 5.3 Policy Engine

职责：

- 对即将执行的 intent 做规则检查
- 生成 policy violation summary
- 解释为什么需要人工审批
- 作为 agent 的 guardrail

规则示例：

- 单笔金额上限
- 日累计金额上限
- 允许的接收方白名单
- 允许的 mint 列表
- 是否强制 memo
- 是否需要双人审批

### 5.4 Agent Assist

职责：

- 从 invoice 文本、CSV、简化表单生成 payout draft
- 解释 intent 字段
- 给出 batch grouping 建议

必须遵守的边界：

- Agent 只能生成草案
- Agent 不能绕过 policy
- Agent 不能直接发起最终执行

### 5.5 Relayer / Paymaster

职责：

- 拉取已经批准的 intent
- 构造链上执行交易
- sponsor gas
- 处理 compute budget 和 priority fee
- 提交交易并监听确认
- 失败重试
- 回写状态

这是系统里最关键的“执行层”，也是 demo 中最能体现技术壁垒的部分。

### 5.6 Indexer

职责：

- 订阅 program events
- 将链上状态同步回数据库
- 维护 intent 状态机视图
- 提供 dashboard 查询性能

hackathon 版本可用简化实现：

- 轮询 + websocket
- 仅 index 自己的 program accounts
- 仅保存必要 event

## 6. 链上程序设计

## 6.1 Program 边界

链上程序只负责：

- policy state
- intent state
- approval state
- execution recording
- vault / escrow state

链上程序不负责：

- AI
- OCR
- invoice parsing
- 全量业务数据库

## 6.2 核心账户模型

### PolicyAccount

建议字段：

```rust
pub struct PolicyAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub daily_limit: u64,
    pub per_tx_limit: u64,
    pub require_memo: bool,
    pub require_second_approval: bool,
    pub bump: u8,
}
```

### PaymentIntent

```rust
pub struct PaymentIntent {
    pub organization: Pubkey,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub reference: [u8; 32],
    pub memo: String,
    pub status: IntentStatus,
    pub expires_at: i64,
    pub policy: Pubkey,
    pub bump: u8,
}
```

### ApprovalRecord

```rust
pub struct ApprovalRecord {
    pub intent: Pubkey,
    pub approver: Pubkey,
    pub approved_at: i64,
    pub approval_digest: [u8; 32],
    pub bump: u8,
}
```

### ExecutionRecord

```rust
pub struct ExecutionRecord {
    pub intent: Pubkey,
    pub relayer: Pubkey,
    pub executed_at: i64,
    pub tx_sig: [u8; 64],
    pub result_code: u16,
    pub bump: u8,
}
```

## 6.3 指令设计

建议最少包含这些 instruction：

- `create_policy`
- `update_policy`
- `create_intent`
- `cancel_intent`
- `record_approval`
- `execute_intent`
- `mark_failed`

可选扩展：

- `create_batch`
- `approve_batch`
- `execute_batch`
- `release_escrow`

## 7. 状态机

单个 intent 建议使用下面的状态：

```text
Draft -> PendingApproval -> Approved -> Submitted -> Confirmed
                              |             |
                              v             v
                           Rejected       Failed -> Retrying -> Confirmed
```

说明：

- `Draft`：草案刚创建，尚未进入审批
- `PendingApproval`：等待审批
- `Approved`：审批完成，可以被 relayer 拉取
- `Submitted`：交易已提交但未最终确认
- `Confirmed`：交易成功
- `Failed`：执行失败
- `Retrying`：重试中
- `Rejected`：人工否决

## 8. 核心业务流

### 8.1 单笔付款流

1. Client 创建 intent
2. Control Plane 写入数据库
3. Policy Engine 做规则检查
4. 前端展示 human-readable approval
5. Approver 签名
6. Relayer 拉取 `Approved` 状态 intent
7. Relayer 构造交易并 sponsor gas
8. Indexer 监听结果并更新状态

### 8.2 Agent 起草流

1. Agent 从文本或 CSV 生成 payout draft
2. Draft 进入 `Draft`
3. Human review
4. 审批后进入正常执行流

### 8.3 批量结算流

1. 多个 intent 被聚合成 batch
2. Batch 审批
3. Relayer 逐笔提交或按策略分片提交
4. Dashboard 展示每笔状态

## 9. Wallet Approval UX

这个项目最关键的体验不在“转账”本身，而在“审批感知”。

审批卡片至少要清楚展示：

- 接收方名称和地址
- 金额和币种
- invoice / payout reference
- memo
- 是否由 AI 草拟
- 当前 policy 是否全部通过

设计原则：

- 先给人类理解，再让人类签名
- 审批信息必须比原始 transaction 更容易读
- 即使钱包不支持完整 typed rendering，也要在前端先做好解释层

## 10. 安全模型

### 10.1 基本安全原则

- AI 不直接控制资金
- Relayer 不拥有最终审批权
- 所有执行都绑定到 policy
- 所有执行都必须可追溯

### 10.2 主要风险

- Relayer 重放执行
- intent 被重复消费
- memo / reference 不一致
- 非授权接收方注入
- 过期 intent 被错误执行

### 10.3 缓解措施

- 每个 intent 唯一 reference
- 执行前再次检查状态
- intent 设置 expiry
- program 内校验 recipient / mint / amount
- 执行记录不可变

## 11. 可观测性

必须要有最小 observability：

- intent 创建数量
- intent 审批耗时
- relayer 成功率
- 平均确认时延
- 失败原因分类

hackathon 版本可以先做到：

- 结构化日志
- execution result dashboard
- 失败重试列表

## 12. 技术选型建议

### 链上

- `Rust`
- `Anchor`
- `SPL Token`
- `Memo program`

### 链下

- `Rust` 或 `TypeScript` 做 relayer
- `Next.js` / `React` 做 dashboard
- `Postgres` 或 `SQLite` 做 hackathon 数据库
- `Redis` 可选，做队列和重试

### 索引和 RPC

- `Helius` / `Triton` / `Yellowstone gRPC` 均可
- hackathon 版本优先使用已有 RPC provider，避免自己造 infra

## 13. 架构阶段划分

### Phase 0

- 单 organization
- 单 approval
- 单 mint
- 单 relayer

### Phase 1

- batch payouts
- policy templates
- webhook
- dashboard filters

### Phase 2

- 多组织
- 二次审批
- counterparty allowlist
- action links

### Phase 3

- agent memory
- auto-draft
- external ERP / accounting integration

## 14. Hackathon 版本建议

如果时间有限，优先保证这些东西真的做出来：

- Intent 状态机
- 可读审批页面
- Relayer sponsor gas
- USDC devnet 演示
- memo / reference 对账
- execution log

不要为了“架构完整”而牺牲 demo 的完成度。

## 15. 最终建议

对于 hackathon，最好的架构不是最大最全的架构，而是：

- 核心边界清晰
- 链上责任最小但关键
- 链下服务可替换
- demo 流程稳定

PolicyPay 的正确架构路线是：

**链上做 state machine 和 execution guardrails，链下做 orchestration 和 UX。**
