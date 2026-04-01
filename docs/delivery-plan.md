# PolicyPay 需求与实施计划

## 1. 交付目标

在黑客松周期内交付一个可演示闭环：

- 创建支付 intent
- 人类可读审批
- Relayer 代付 gas 执行
- 执行状态可追踪与可审计

## 2. 范围定义

### 2.1 P0（必须完成）

1. 核心状态机
- `Draft -> PendingApproval -> Approved -> Submitted -> Confirmed/Failed`

2. 链上最小能力
- `create_policy`
- `create_intent`
- `approve_intent`
- `execute_intent`

3. 控制面最小 API
- `POST /intents`
- `GET /intents/:id`
- `POST /intents/:id/approve`
- `GET /executions/:id`

4. Relayer 最小能力
- 拉取 `Approved` intent
- sponsor gas 并提交交易
- 回写 `Submitted/Confirmed/Failed`

5. Dashboard 最小能力
- 创建 intent
- 审批 intent
- 查看执行状态

6. 审计与重试
- 保存审批人、时间、签名摘要
- 失败 intent 支持最小重试（最多 3 次）

### 2.2 P1（时间允许）

- Batch payout
- Webhook
- 策略编辑器 UI
- 失败分类统计
- Typed message payload 原型

### 2.3 P2（后续演进）

- 二次审批
- 多组织权限模型
- 高级队列调度
- 多 relayer 高可用

## 3. 验收标准（按模块）

### 3.1 Onchain Program

- 能创建/更新 intent 并校验非法状态跳转。
- 相同 intent 不可重复执行成功。

### 3.2 Control Plane

- API 返回状态与链上状态一致。
- 审批和执行日志可按 intent 查询。

### 3.3 Relayer

- 能自动执行批准单。
- 能记录 tx id、失败原因、重试次数。

### 3.4 Dashboard

- 审批页面展示：`recipient/amount/mint/memo/reference`。
- 状态展示至少含：`Approved/Submitted/Confirmed/Failed`。

### 3.5 Agent Adapter（最小）

- 能将自然语言转换为结构化 draft intent。
- 所有 AI 输出都必须经过人工审批。

## 4. 12 天实施节奏

### Day 1-2

- 升级链上程序数据结构。
- 写状态机和状态校验测试。

### Day 3-4

- 建立 Control Plane API。
- 打通 intent 创建与审批记录。

### Day 5-6

- 实现 Relayer 执行链路。
- 完成提交、确认、失败回写。

### Day 7-8

- 完成 Dashboard 的创建/审批/追踪页面。
- 接入钱包签名流程。

### Day 9

- 增加 Agent draft 最小功能。
- 明确“AI suggestion only”标识。

### Day 10

- 端到端联调。
- 处理稳定性问题。

### Day 11

- 完成可观测信息与失败重试演示。
- 补齐演示数据。

### Day 12

- 完成 demo 脚本与录制。
- 收敛文档，确保新人可复现。

## 5. Demo 最小脚本（必须全通）

1. 创建 policy。
2. 创建 3 笔 intent（至少 1 笔来自 AI draft）。
3. 执行人工审批。
4. Relayer 自动提交并确认交易。
5. Dashboard 展示状态变化与 tx id。
6. 人工制造 1 笔失败并演示重试成功。

## 6. 风险与缓解

1. 钱包 typed approval 兼容性不足
- 缓解：先用可读审批页 + signMessage fallback。

2. AI 输出结构不稳定
- 缓解：schema 校验，不合法直接拒绝入库。

3. 演示时 RPC 不稳定
- 缓解：预置测试数据 + 失败回退脚本。

4. 时间不足
- 缓解：严格按 P0 收敛，P1/P2 不阻塞提交。

## 7. 交付物清单

- 可运行链上程序
- 可运行 Control Plane
- 可运行 Relayer
- 可运行 Dashboard
- 端到端 demo 视频
- README + 架构文档 + 实施计划
