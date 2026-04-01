# PolicyPay 需求与实施计划

## 1. 执行策略调整

本计划采用“核心功能前置打磨”策略：

- 核心功能不后置，不以后续补功能的方式回填主链路。
- 第一轮就实现完整核心面，并完成端到端稳定性验证。
- 仅锦上添花能力放入后续迭代。

## 2. 核心功能范围（第一轮必须完成）

1. 策略系统
- 金额上限。
- 接收方白名单。
- memo 规则。

2. Intent 与审批
- 单笔 intent。
- 批量 intent。
- 人类可读审批内容。
- 审批留痕（审批人、时间、签名摘要）。

3. 执行系统
- Relayer sponsor gas。
- 幂等执行。
- 失败重试（最多 3 次）。

4. 状态追踪与审计
- `Approved/Submitted/Confirmed/Failed` 全状态可追踪。
- 链上 tx id 与业务 intent 可关联。

5. 全流程前端
- 创建 intent。
- 审批 intent。
- 查看执行日志。
- 失败重试操作。

6. Agent draft
- 自然语言/CSV 转 draft。
- AI 输出强制人工审批后才可执行。

## 3. 后置能力（非核心）

- OCR 发票解析。
- 多 relayer 高可用。
- 复杂组织 RBAC。
- 高级报表、告警自动化。
- 钱包原生 typed rendering 深度集成。

## 4. 架构冻结与需求冻结

### Day 1-2 冻结项

1. 核心实体与字段。
2. 状态机与状态约束。
3. 模块接口契约。
4. API 契约与错误码。
5. 审批与审计字段。

### 冻结后变更规则

- 核心模块不做破坏式改造。
- 新需求若不影响主链路正确性，进入后置池。
- 任何核心变更需证明可以保持向后兼容。

## 5. 12 天实施节奏

### Day 1-2：设计与冻结

- 完成领域模型、状态机、接口契约。
- 评审并冻结架构与核心需求。

### Day 3-5：后端核心落地

- Onchain Program 实现核心账户和指令。
- Control Plane 完成策略、intent、审批、执行查询 API。

### Day 6-8：执行与前端闭环

- Relayer 实现自动执行、幂等和重试。
- Dashboard 实现创建、审批、追踪、重试。
- Agent draft 完成最小可用能力。

### Day 9-10：联调与稳定性

- 端到端联调。
- 失败场景压测与恢复验证。
- 修复阻断主流程的问题。

### Day 11-12：验收与演示

- 按验收清单逐项走查。
- 固化 demo 数据和脚本。
- 完成演示录制与文档收敛。

## 6. 验收标准（核心功能）

1. Onchain Program
- 非法状态跳转被拒绝。
- 已确认 intent 不可重复执行成功。

2. Control Plane
- API 与链上状态一致。
- 每笔 intent 均可查询审批与执行记录。

3. Relayer
- 自动执行 approved intent 成功。
- 失败可重试并保留完整失败原因。

4. Dashboard
- 可读审批字段完整（recipient/amount/mint/memo/reference）。
- 全状态可视化、支持失败重试入口。

5. Agent Adapter
- 输出 draft 必须符合 schema。
- 无人工审批不可执行。

## 7. Demo 必测脚本（必须全通）

1. 创建 policy。
2. 创建 1 笔单笔 intent + 1 笔批量 intent。
3. 至少 1 笔由 AI draft 生成。
4. 完成人工审批。
5. Relayer 自动执行并回写状态。
6. 演示 1 笔失败 + 重试成功。
7. Dashboard 显示完整审计轨迹与 tx id。

## 8. 交付物清单

- 可运行链上程序（核心指令完备）
- 可运行 Control Plane
- 可运行 Relayer
- 可运行 Dashboard
- 可运行 Agent draft
- README + architecture + delivery-plan
- 端到端 demo 视频
