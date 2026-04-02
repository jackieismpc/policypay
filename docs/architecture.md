# PolicyPay 模块化架构

## 1. 架构目标

在可控风险下，把稳定币支付从手工链上操作升级为可审批、可执行、可审计的业务流程。

本项目采用“核心先定型、按真实现状递进落地”的策略：

- 先对齐文档与真实代码状态，再推进实现。
- 先把链上底座打磨稳定，再逐层补齐离链闭环。
- 主链路优先，锦上添花能力后置。

## 2. 当前实现基线

### 2.1 已实现部分

当前仓库已存在链上最小原型：`programs/policy_pay/`。

已实现链上指令：

- `create_policy`
- `create_intent`
- `create_draft_intent`
- `submit_draft_intent`
- `create_batch_intent`
- `add_batch_item`
- `submit_batch_for_approval`
- `approve_batch_intent`
- `cancel_batch_intent`
- `approve_intent`
- `execute_intent`
- `settle_intent`
- `retry_intent`
- `cancel_intent`

当前链上核心账户：

- `PolicyAccount`
- `PaymentIntent`
- `BatchIntent`

当前真实可达状态流：

- 单笔：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批量：`Draft -> PendingApproval -> Approved | Cancelled`

当前已覆盖的最小测试：

- 主流程生命周期
- 失败后重试再成功
- 白名单约束
- memo 必填约束
- 权限边界
- 非法状态迁移
- 长度边界
- retry 上限

### 2.2 当前已落地的离链模块

- `services/control-plane/`
- `services/relayer/`
- `services/indexer/`
- `app/`
- `modules/agent-adapter/`

这些模块已经形成可演示闭环，其中 Dashboard 已升级为交互式工作台版本，并支持单端口组合部署（默认）。

### 2.3 当前未实现部分

- 更高阶存储后端（如 PostgreSQL）与迁移体系
- 最终 demo 视频交付物

## 3. 设计原则

1. 领域模型以链上真实状态为基线
- 当前以 `PolicyAccount`、`PaymentIntent`、`IntentStatus` 作为第一份真实领域模型来源。

2. 一条指令只负责一次清晰的状态迁移
- 继续沿用当前链上程序的状态迁移设计，便于测试、审计和错误定位。

3. Control Plane 不替代链上事实
- Control Plane 负责统一 API、业务映射和审计聚合，但链上账户仍是最终事实源。

4. Draft 人工审批前置
- Agent draft 和链上 draft 并行存在，但都必须经过人工确认后再进入执行路径。

5. 共享抽象由复用需求驱动
- 只有当 control plane、relayer、dashboard 确实共享类型或逻辑时，再抽取 `modules/domain` 等共享模块。

6. 路由与异步优先 Rust 技术栈
- 新增高并发路由/异步模块优先采用 `tokio + axum`，现有 Express 模块以兼容为主逐步演进。

## 4. 模块划分

### 4.1 Domain Module

职责：

- 定义统一实体、状态机、错误码与事件映射。
- 复用链上模型并提供离链 DTO。

核心实体：

- `Policy`
- `PaymentIntent`
- `ApprovalRecord`
- `ExecutionRecord`

现状：

- 当前尚未独立落地，短期内以链上模型为准。

### 4.2 Onchain Program Module

职责：

- 持久化核心支付状态。
- 强约束状态转移与基础策略校验。

当前已实现：

- policy 创建
- 单笔 intent 创建
- 单笔 draft 创建与提交
- batch intent 账户创建、加项、提交审批、审批、取消
- 审批
- 执行提交
- 成功/失败结算
- retry
- cancel

当前缺口：

- 审计记录与事件仍可继续完善
- Control Plane 尚未默认切换到链上 `BatchIntent` 模式

### 4.3 Policy Engine Module

职责：

- 校验 intent 是否满足组织策略。
- 输出可读解释（允许/拒绝原因）。

边界：

- 不执行链上交易。

现状：

- 当前最小策略校验已直接体现在链上程序中，后续再按复用需求抽离离链策略层。

### 4.4 Control Plane Module

职责：

- 提供统一 API。
- 管理策略、审批、审计日志与 webhook。
- 对链上账户与业务侧记录做映射。

边界：

- 不替代链上事实。
- 不绕过链上审批与状态机。

当前范围：

- 查询单个 policy
- 查询单个 intent
- 编排 `create_intent`
- 编排 `create_intent` 批量模式（循环调用）
- 编排 `approve_intent`
- 编排 `approve_intent` 批量模式
- 编排 `cancel_intent`
- 编排 `retry_intent`
- 记录最小本地审计日志

### 4.5 Execution Engine (Relayer) Module

职责：

- 拉取已批准 intent。
- 构造交易并代付 gas。
- 提交、确认、失败重试、状态回写。

边界：

- 不定义策略，不绕过审批。

当前范围：

- 单笔执行记录
- 批量执行记录
- 失败原因记录与过滤查询
- 确认回写
- 模块化持久化（默认 SQLite，可切换 JSON）

### 4.6 Dashboard Module

职责：

- 创建单笔/批量 intent。
- 展示可读审批信息与执行状态。
- 提供失败重试入口与审计视图。

边界：

- 不直接持有后端热钱包密钥。

当前范围：

- 交互式工作台页面
- 单笔 intent 创建表单
- 批量 intent 创建表单
- 批量审批入口
- 摘要、审计、执行、时间线面板
- 默认单端口组合模式下，内嵌挂载 Control Plane / Relayer / Indexer
- proxy 模式下，通过 dashboard 代理 API 聚合外部 Control Plane / Relayer / Indexer

### 4.7 Agent Adapter Module

职责：

- 将自然语言/CSV 转换为 draft intent。
- 输出结构化解释与风险提示。

边界：

- 只能草拟，不可直接执行。

当前范围：

- CSV draft 解析
- 自然语言 draft 解析
- CSV 批量 draft 解析
- 自然语言批量 draft 解析
- `requiresHumanApproval: true` 强制约束
- 风险提示输出

### 4.8 Indexer & Observability Module

职责：

- 订阅链上事件或轮询链上状态并回写。
- 输出成功率、失败原因、处理延迟等指标。

边界：

- 不参与审批决策。

当前范围：

- 区分 `chain` / `relayer` 来源的时间线记录
- 时间线 HTTP 查询接口（按 `intentId` / `source` 过滤）
- 模块化持久化（默认 SQLite，可切换 JSON）

## 5. 模块接口契约（可替换点）

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

## 6. 当前优先级排序

推荐实施顺序：

1. 文档对齐
2. 链上 Program 收口与测试补强
3. Control Plane MVP
4. Relayer + Indexer MVP
5. Dashboard MVP
6. Agent Adapter Draft MVP
7. 最终 README / docs / 示例 / demo 收尾

### 6.1 当前 Control Plane MVP 范围

当前阶段的 Control Plane 已扩展到单笔 + 批量编排：

- 查询单个 policy
- 查询单个 intent
- 编排 `create_intent`
- 编排 `create_intent` 批量模式
- 编排 `approve_intent`
- 编排 `approve_intent` 批量模式
- 编排 `cancel_intent`
- 编排 `retry_intent`
- 记录本地审计日志（单笔和批量）

### 6.2 当前 Relayer / Indexer MVP 范围

当前阶段的后台闭环已经升级到可查询版本：

- Relayer 提供单笔/批量执行任务记录、失败原因记录、确认回写
- Relayer 提供按状态过滤查询
- Indexer 提供时间线记录，区分链上状态与 relayer 状态来源
- Indexer 提供时间线查询与过滤接口
- 两者当前使用模块化存储，默认 SQLite（可按环境切换 JSON）

### 6.3 当前 Dashboard MVP 范围

当前阶段的 Dashboard 已升级为可操作工作台：

- 单笔 intent 创建
- 批量 intent 创建
- 批量审批
- 摘要、审计、执行、时间线四类面板
- 内置代理 API 聚合 Control Plane、Relayer、Indexer

### 6.4 当前 Agent Adapter MVP 范围

当前阶段的 Agent Adapter 已支持单笔与批量草拟：

- CSV draft
- 自然语言 draft
- CSV 批量 draft
- 自然语言批量 draft
- 风险提示
- 强制人工审批前置

## 7. 当前核心状态机

### 7.1 当前实际链上状态机

单笔：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`

批量：`Draft -> PendingApproval -> Approved | Cancelled`

### 7.2 目标扩展方向

- 为批量执行增加更细粒度 item 级别执行态（如 `Submitted` / `Confirmed` / `Failed`）
- 将链上 batch 指令逐步接入 Control Plane 对外编排 API

## 8. 架构冻结点

当前应冻结：

1. 当前链上真实领域模型与状态机
2. 链上错误码与测试边界
3. Control Plane / Relayer / Indexer / Dashboard / Agent Adapter 的最小职责边界
4. 本地凭据与测试环境约定
5. 大阶段提交、审查和验证门禁

## 9. 推荐仓库结构

```text
policypay/
  README.md
  docs/
    architecture.md
    delivery-plan.md
  programs/
    policy_pay/
  services/
    control-plane/
    relayer/
    indexer/
  app/
  modules/
    agent-adapter/
```
