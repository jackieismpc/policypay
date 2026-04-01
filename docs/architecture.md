# PolicyPay 模块化架构

## 1. 架构目标

在可控风险下，把稳定币支付从手工链上操作升级为可审批、可执行、可审计的业务流程。

本项目采用“核心先定型”策略：

- 核心架构第一阶段冻结，不在中途重做主干设计。
- 核心能力第一阶段完整实现，不采用“先砍主功能后补回”的路径。

## 2. 设计原则

1. 模块边界先于实现
- 每个模块先定义输入/输出与依赖，再选技术栈。

2. 领域模型唯一
- `Intent`、`Policy`、`Approval`、`Execution` 为全系统共享语义。

3. 可替换实现
- AI、数据库、队列、RPC、钱包连接器都通过适配层接入。

4. 核心能力一次性打磨
- 主流程能力（策略、审批、执行、回写、重试）在首轮版本即达到可用质量。

5. 增量仅用于非核心能力
- 仅对与主链路距离较远的能力采用后置迭代。

## 3. 模块划分

### 3.1 Domain Module

职责：

- 定义统一实体、状态机、错误码与事件。

核心实体：

- `Policy`
- `PaymentIntent`
- `ApprovalRecord`
- `ExecutionRecord`

### 3.2 Onchain Program Module

职责：

- 持久化核心支付状态。
- 强约束状态转移与资金相关校验。

边界：

- 不处理 AI、OCR、报表查询。

### 3.3 Policy Engine Module

职责：

- 校验 intent 是否满足组织策略。
- 输出可读解释（允许/拒绝原因）。

边界：

- 不执行链上交易。

### 3.4 Control Plane Module

职责：

- 提供统一 API。
- 管理策略、审批、审计日志与 webhook。

边界：

- 不替代链上事实，只维护业务侧映射与操作轨迹。

### 3.5 Execution Engine (Relayer) Module

职责：

- 拉取已批准 intent。
- 构造交易并代付 gas。
- 提交、确认、失败重试、状态回写。

边界：

- 不定义策略，不绕过审批。

### 3.6 Dashboard Module

职责：

- 创建单笔/批量 intent。
- 展示可读审批信息与执行状态。
- 提供失败重试入口与审计视图。

边界：

- 不直接持有后端热钱包密钥。

### 3.7 Agent Adapter Module

职责：

- 将自然语言/CSV 转换为 draft intent。
- 输出结构化解释与风险提示。

边界：

- 只能草拟，不可直接执行。

### 3.8 Indexer & Observability Module

职责：

- 订阅链上事件并回写状态。
- 输出成功率、失败原因、处理延迟等指标。

边界：

- 不参与审批决策。

## 4. 模块接口契约（可替换点）

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
- retry(intent_id) -> {queued, retry_count}

DraftProvider
- generate(input) -> draft_intent

EventSink
- publish(event)
```

替换示例：

- 更换数据库：替换 `IntentRepository`。
- 更换 LLM：替换 `DraftProvider`。
- 更换 RPC 或执行策略：替换 `ChainExecutor`。

## 5. 核心功能定义（首轮必须实现）

1. 策略管理与策略校验（金额上限、接收方白名单、memo 规则）。
2. 单笔与批量 intent。
3. 人类可读审批与审批留痕。
4. Relayer 幂等执行与失败重试。
5. 执行状态回写与可观测性。
6. Dashboard 全流程可操作。
7. Agent draft + 人工把关。

## 6. 后置功能定义（可后续补充）

- OCR/发票解析。
- 多 relayer 高可用调度。
- 复杂组织权限模型。
- 高级 BI 报表与自动告警。

## 7. 核心状态机

`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`

规则：

- 仅 `Approved` 可进入 `Submitted`。
- `Confirmed` 为终态，不允许重复执行。
- `Failed` 仅在可重试条件满足时进入重试队列。

## 8. 架构冻结点（Architecture Freeze）

在正式开发第 2 天结束前冻结以下内容：

1. 核心实体字段与状态机。
2. 模块边界与接口契约。
3. API 最小集合与错误码约定。
4. 审批数据结构与审计字段。

冻结后规则：

- 核心模块仅允许兼容性增强，不允许破坏式重构。
- 新增需求默认进入后置池，除非影响核心主链路正确性。

## 9. 推荐仓库结构

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
