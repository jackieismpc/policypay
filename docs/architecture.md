# PolicyPay 模块化架构

## 1. 目标

本架构只服务一个目标：

在可控风险下，把稳定币支付从手工链上操作升级为可审批、可执行、可审计的业务流程。

## 2. 设计原则

1. 模块边界先于实现
- 每个模块先定义输入/输出与依赖，再选技术栈。

2. 领域模型唯一
- `Intent`、`Policy`、`Approval`、`Execution` 为全系统共享语义，避免多套定义。

3. 可替换实现
- AI 提供商、数据库、队列、RPC、钱包连接器都必须通过适配层接入。

4. 最小闭环优先
- 先交付 `创建 -> 审批 -> 执行 -> 回写`，再扩展 batch、二次审批等高级能力。

## 3. 模块划分

### 3.1 Domain Module

职责：

- 定义统一实体与状态机。
- 定义错误码、事件、ID 规范。

核心实体：

- `Policy`
- `PaymentIntent`
- `ApprovalRecord`
- `ExecutionRecord`

### 3.2 Onchain Program Module

职责：

- 持久化核心支付状态。
- 执行状态转移与关键约束。

边界：

- 不处理 AI、OCR、报表、复杂查询。

### 3.3 Policy Engine Module

职责：

- 校验 intent 是否满足组织策略。
- 输出可读解释（允许/拒绝原因）。

边界：

- 不执行链上交易。

### 3.4 Control Plane Module

职责：

- 对外暴露统一 API。
- 管理策略、审批、日志、Webhook。

边界：

- 不保存链上真相，只保存业务侧映射与审计补充信息。

### 3.5 Execution Engine (Relayer) Module

职责：

- 拉取已批准 intent。
- 构造交易并代付 gas。
- 提交、确认、失败重试、状态回写。

边界：

- 不定义策略，不绕过审批。

### 3.6 Dashboard Module

职责：

- 创建 intent。
- 展示审批信息（可读字段）。
- 展示执行状态与审计轨迹。

边界：

- 不直接持有后端密钥，不直接操作链上热钱包。

### 3.7 Agent Adapter Module

职责：

- 把自然语言/CSV 转为 draft intent。
- 输出可解释摘要。

边界：

- 只能生成草案，不能直接触发执行。

### 3.8 Indexer & Observability Module

职责：

- 订阅链上事件，回写执行状态。
- 产出健康度、失败率、延迟指标。

边界：

- 不参与审批决策。

## 4. 模块接口契约（可替换点）

以下接口是“替换开关”，任何实现都应满足：

```text
IntentRepository
- create(intent)
- get(intent_id)
- list(filters)
- update_status(intent_id, status)

PolicyEvaluator
- evaluate(intent, policy_set) -> {allowed, reasons[]}

ApprovalService
- request(intent_id)
- approve(intent_id, approver, signature)

ChainExecutor
- submit(intent) -> tx_id
- confirm(tx_id) -> {confirmed, error}

DraftProvider
- generate(input) -> draft_intent

EventSink
- publish(event)
```

替换示例：

- 更换数据库：只替换 `IntentRepository` 实现。
- 更换 LLM：只替换 `DraftProvider` 实现。
- 更换 RPC/交易执行策略：只替换 `ChainExecutor` 实现。

## 5. 关键状态机

`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`

规则：

- 只有 `Approved` 才能进入 `Submitted`。
- `Confirmed` 为终态，不可重放执行。
- `Failed` 可进入重试队列，但必须保留失败原因和次数。

## 6. 关键流程

### 6.1 手动创建支付

1. Dashboard 提交 intent。
2. Control Plane 调用 Policy Engine 校验。
3. 通过校验后进入审批队列。
4. 审批完成后交给 Relayer 执行。
5. Indexer 回写确认状态，Dashboard 展示结果。

### 6.2 AI 草拟支付

1. 用户输入自然语言或 CSV。
2. Agent Adapter 输出 draft + 解释。
3. 用户确认后走同一审批与执行流程。

## 7. 推荐仓库结构

```text
policypay/
  README.md
  docs/
    architecture.md
    delivery-plan.md
  modules/
    domain/
    policy-engine/
    agent-adapter/
  programs/
    policy_pay/
  services/
    control-plane/
    relayer/
    indexer/
  apps/
    dashboard/
```

## 8. 实施建议（从当前脚手架演进）

1. 保留现有 Anchor 工程骨架，先把 `demo1` 升级为 `policy_pay`。
2. 先用单一后端进程承载 `Control Plane + Policy Engine`，后续再拆服务。
3. 先用轮询型 indexer，功能稳定后再升级为事件流。
4. 所有模块先写接口层，再写具体实现，避免后期重构成本。
