# PolicyPay 需求与实施计划

## 1. 当前阶段判断

当前仓库已经有链上最小原型，但整体产品仍未形成完整闭环。

### 当前已实现

- Anchor program：`programs/policy_pay/`
- 已实现指令：
  - `create_policy`
  - `create_intent`
  - `approve_intent`
  - `execute_intent`
  - `settle_intent`
  - `retry_intent`
  - `cancel_intent`
- 当前可达状态流：
  - `PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 已有 Anchor 测试覆盖：
  - 主流程生命周期
  - 失败后重试
  - 白名单
  - memo 约束

### 当前未完成

- 权限边界与错误码测试仍需补齐
- batch intent 未实现
- `Draft` 尚未作为链上可达流程落地
- Control Plane / Relayer / Indexer / Dashboard / Agent Adapter 仍未落地
- `app/` 为空
- `migrations/deploy.ts` 仍是默认占位脚本

## 2. 实施原则

- 先更新文档，再开始对应阶段编码
- 先收口链上正确性，再推进离链闭环
- 先做单笔 intent 主闭环，再扩展 batch intent 和 agent draft
- 主链路所需能力优先，非核心能力后置
- 所有阶段都要同步测试与文档

## 3. 分阶段实施顺序

### 阶段 0：文档对齐与规则落地

目标：让文档、目录、真实能力和开发流程一致。

本阶段输出：

- 更新 `README.md`
- 更新 `docs/architecture.md`
- 更新 `docs/delivery-plan.md`
- 补充 `.gitignore`，明确本地凭据、钱包、环境文件不推远端

要求：

- README 不再把当前仓库描述为 `demo1` scaffold
- 文档明确区分“已实现”和“待实现”
- 写清新的实施顺序和质量门禁

### 阶段 1：链上 Program 收口与测试补强

目标：把 `programs/policy_pay` 打磨成稳定底座。

本阶段重点：

- 补权限边界测试
- 补非法状态迁移测试
- 补长度边界测试
- 补 retry 上限测试
- 把失败断言尽量升级为错误码断言
- 评估是否需要最小事件/审计字段，为后续 indexer 预留

本阶段暂不做：

- 不急于启用链上 `Draft`
- 不急于扩展 batch intent

### 阶段 2：Control Plane MVP

目标：建立最小离链业务层，统一查询、编排与审计。

本阶段重点：

- 查询 policy / intent
- 编排 create / approve / cancel / retry 等动作
- 统一错误映射
- 记录最小审计日志
- 固化本地运行与测试配置约定

当前阶段补充说明：

- 审计日志先写入本地 JSON 文件，后续再迁移到更正式的存储层。
- 当前只覆盖单笔 intent 闭环，不在此阶段扩展 batch intent。
- 当前不接入自动执行，Relayer 和 Indexer 在下一阶段接入。

### 阶段 3：Relayer + Indexer MVP

目标：打通自动执行、失败重试、状态回写闭环。

本阶段重点：

- 自动拉取 approved intent
- 幂等提交
- 失败重试
- 状态回写
- 记录 tx signature、失败原因、retry 次数和时间线

### 阶段 4：Dashboard MVP

目标：完成可演示的人类操作闭环。

本阶段重点：

- 复用现有 `app/` 目录做最小前端
- 支持创建 intent
- 支持审批与取消
- 展示执行状态
- 提供失败重试入口

### 阶段 5：Agent Adapter Draft MVP

目标：支持自然语言 / CSV -> draft intent，但必须人工确认后才能落链执行。

本阶段重点：

- Draft schema
- 结构化解释与风险提示
- 人工确认后再调用链上 `create_intent`

说明：

- 当前阶段优先把 Draft 作为离链概念处理，不在主链路未稳定前扩大链上状态机。

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

## 5. 当前阶段的现实优先级

虽然批量 intent 和 agent draft 属于第一轮目标，但按当前仓库现状，优先级应为：

1. 文档对齐
2. 链上底座与测试补强
3. 单笔 intent 离链闭环
4. batch intent
5. agent draft

原因：

- 当前唯一成熟代码资产在链上程序和测试
- 非链上模块尚无现成基础
- 过早同时推进 batch、dashboard、agent 容易扩大面并拖慢主闭环

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
- `anchor test`
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

- 链上测试覆盖权限、状态迁移、边界与 retry 上限
- 现有主流程测试继续通过

### 阶段 2

- Control Plane API 与链上状态一致
- 可以查询并编排基础 intent 流程
- 审计记录可追踪

### 阶段 3

- Relayer 可自动执行 approved intent
- 失败可重试并保留失败原因
- Indexer/回写层能形成清晰时间线

### 阶段 4

- Dashboard 可创建、审批、查看状态、触发重试
- 人类可读字段完整展示

### 阶段 5

- Draft 输出符合 schema
- 无人工确认不可进入执行路径

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
