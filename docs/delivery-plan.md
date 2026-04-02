# PolicyPay 需求与实施计划

## 1. 当前阶段判断

当前仓库已经有链上最小原型，并且已经具备最小离链闭环，但整体产品仍未形成最终可交付版本。

### 当前已实现

- Anchor program：`programs/policy_pay/`
- 已实现指令：
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
- 当前可达状态流：
  - 单笔：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
  - 批量：`Draft -> PendingApproval -> Approved | Cancelled`
- 已有 Anchor 测试覆盖：
  - 主流程生命周期
  - 失败后重试
  - 白名单
  - memo 约束
  - 权限边界
  - 非法状态迁移
  - 长度边界
  - retry 上限
- 已有最小：
  - Control Plane MVP
  - Relayer MVP
  - Indexer MVP
  - Dashboard Workbench（交互式）
  - Agent Adapter MVP

### 当前未完成

- Control Plane 当前批量编排默认仍是多次 `create_intent` 调用，尚未切换到链上 `BatchIntent` 指令路径
- 仍需继续扩展并发压力与失败恢复场景的端到端回归覆盖
- 最终 demo 视频仍需录制

## 2. 实施原则

- 先更新文档，再开始对应阶段编码
- 先收口链上正确性，再推进离链闭环
- 先做单笔 intent 主闭环，再扩展 batch intent 和 agent draft
- 主链路所需能力优先，非核心能力后置
- 所有阶段都要同步测试与文档

## 3. 分阶段实施顺序

### 阶段 0：文档对齐与规则落地

目标：让文档、目录、真实能力和开发流程一致。

### 阶段 1：链上 Program 收口与测试补强

目标：把 `programs/policy_pay` 打磨成稳定底座。

### 阶段 2：Control Plane MVP

目标：建立最小离链业务层，统一查询、编排与审计。

当前阶段补充说明：

- 审计日志存储已模块化，默认 SQLite，可按环境切换 JSON。
- 当前只覆盖单笔 intent 闭环，不在此阶段扩展 batch intent。
- 当前不接入自动执行，Relayer 和 Indexer 在下一阶段接入。

### 阶段 3：Relayer + Indexer MVP

目标：打通自动执行、失败重试、状态回写闭环。

当前阶段补充说明：

- 当前先完成最小可演示后端闭环：执行记录、确认回写、失败原因、时间线索引。
- 执行与时间线存储已模块化，默认 SQLite，可按服务切换 JSON。

### 阶段 3.5：Batch 编排与 Dashboard 工作台（已完成）

目标：在不改变现有链上账户模型的前提下，先完成可用的批量操作闭环和可交互前端。

当前阶段补充说明：

- batch intent 先由 Control Plane 编排为多次 `create_intent` 调用，确保可审计和可追踪。
- Relayer / Indexer 先提供可查询 API，供 Dashboard 直接消费。
- Dashboard 从静态入口升级为可操作页面，覆盖单笔创建、批量创建、状态追踪。
- 当前阶段完成后已落地模块化存储，默认 SQLite，支持切换 JSON。

### 阶段 3.6：链上 Draft + BatchIntent 状态机（已完成）

目标：在链上补齐 `Draft` 和 `BatchIntent` 的可达流程，并补齐对应测试。

当前阶段补充说明：

- 新增链上单笔 draft 指令：`create_draft_intent`、`submit_draft_intent`。
- 新增链上批量账户与指令：`create_batch_intent`、`add_batch_item`、`submit_batch_for_approval`、`approve_batch_intent`、`cancel_batch_intent`。
- Anchor 测试新增 draft 与 batch 生命周期、权限和状态迁移覆盖。
- 保留现有 Control Plane 批量编排接口，作为链上 batch 接口接入前的兼容路径。

### 阶段 4：Dashboard MVP

目标：完成可演示的人类操作闭环。

当前阶段补充说明：

- 先落一个最小 Dashboard 服务，提供页面入口和摘要接口。
- 下一轮再把 Control Plane / Relayer / Indexer 的数据真正渲染成表单与时间线。

### 阶段 5：Agent Adapter Draft MVP

目标：支持自然语言 / CSV -> draft intent，但必须人工确认后才能落链执行。

当前阶段重点：

- CSV / 自然语言输入转换为 draft schema
- draft 默认附带风险提示
- draft 必须带 `requiresHumanApproval: true`
- 无人工确认不可进入执行路径

### 阶段 6：最终收尾与演示交付

目标：形成对外可交付成果。

本阶段必须完成：

- 更新 README
- 补充 docs 中的快速使用与详细使用说明
- 增加示例
- 准备 demo 数据与脚本
- 完成 demo 视频

## 4. 核心功能范围

第一轮必须完成：

1. 策略系统
- 金额上限
- 接收方白名单
- memo 规则

2. Intent 与审批
- 单笔 intent
- 批量 intent
- 人类可读审批内容
- 审批留痕

3. 执行系统
- Relayer sponsor gas
- 幂等执行
- 失败重试（最多 3 次）

4. 状态追踪与审计
- `Approved/Submitted/Confirmed/Failed` 全状态可追踪
- 链上 tx id 与业务 intent 可关联

5. 前端
- 创建 intent
- 审批 intent
- 查看执行日志
- 失败重试操作

6. Agent draft
- 自然语言/CSV 转 draft
- AI 输出必须人工审批后才能执行

补充落地策略：

- batch intent 分两步实施：
  - 第一步（已完成）：Control Plane 编排批量单笔 intent，先完成端到端可用性。
  - 第二步（已完成）：链上 batch 账户模型落地，后续逐步接入 Control Plane API。

## 5. 当前阶段的现实优先级

1. 文档对齐
2. Control Plane 对接链上 `Draft` / `BatchIntent` 编排
3. 扩展并发压力与失败恢复端到端回归
4. demo 视频录制与交付归档

## 6. 质量门禁与提交规则

### 每个大阶段都必须遵守

1. 先更新文档，再开始对应阶段编码
2. 按小改动提交 commit，不把多类改动揉成一个提交
3. Rust/Anchor 改动必须带对应测试
4. 本地凭据、钱包、环境文件不得推送到远端

### 每个大阶段 push 前必须通过

- `cargo fmt`
- `cargo clippy`
- `anchor build`
- `cargo test`
- `yarn run test:anchor:safe`（稳定链路）
- 当前阶段新增模块的对应测试

### 每个大阶段 push 前必须经过 codex 审查

流程：

1. 先本地通过全部检查
2. 调用 codex 做代码审查
3. 修复审查意见
4. 再次调用 codex 审查
5. 直到无阻断意见再 push

## 7. 本地凭据与测试约定

- 测试钱包、临时凭据、环境配置仅保存在本地
- 相关文件必须由 `.gitignore` 覆盖
- 演示数据可以固化，但敏感信息不得提交
- 若需要本地 relayer 或测试 signer，优先存放在仓库忽略路径下

## 8. 分阶段验收标准

### 阶段 0

- README、architecture、delivery-plan 与当前事实一致
- 忽略规则覆盖本地凭据与环境文件

### 阶段 1

- 链上测试覆盖权限、状态迁移、边界、retry 上限、draft 与 batch 新增流程
- 现有主流程测试继续通过

### 阶段 2

- Control Plane API 与链上状态一致
- 可以查询并编排基础 intent 流程
- 审计记录可追踪

### 阶段 3

- Relayer 可记录执行、失败与确认
- Indexer/回写层能形成清晰时间线

### 阶段 4

- Dashboard 可启动、可访问，并提供 MVP 摘要接口
- 后续可继续接入真实数据渲染

### 阶段 3.5（已完成）

- Control Plane 提供 batch 编排接口并记录审计日志
- Relayer / Indexer 提供可查询 API，支持 Dashboard 拉取状态
- Dashboard 支持单笔/批量 intent 创建与状态看板
- 当前阶段新增能力必须有对应自动化测试

### 阶段 5

- Draft 输出符合 schema
- 无人工确认不可进入执行路径
- 链上 `create_draft_intent -> submit_draft_intent` 状态迁移可用

### 阶段 6

- README、docs、示例、demo 视频齐全
- 单笔 intent 主闭环完整可演示
- 最终交付物与文档一致

## 9. Demo 必测脚本

最终至少完成以下演示：

1. 创建 policy
2. 创建单笔 intent
3. 完成人工审批
4. Relayer 自动执行并回写状态
5. 演示 1 笔失败 + 重试成功
6. Dashboard 显示完整状态与 tx id
7. 至少 1 笔 draft 由 Agent / CSV 生成并经人工确认后落链
8. 最终文档与示例可独立复现流程
