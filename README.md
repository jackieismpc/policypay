# PolicyPay

PolicyPay 是一个面向团队、企业和 AI Agent 的稳定币支付操作层。

核心闭环：`Intent 生成 -> 人类可读审批 -> Relayer Gasless 执行 -> 全链路审计`。

## 当前仓库状态

当前仓库已经不再是纯 Anchor 脚手架，而是一个已经跑通最小闭环的黑客松版本。

### 当前执行阶段

- 当前按 `docs/delivery-plan.md` 推进阶段 `3.5`：
  - 通过 Control Plane 编排批量 intent
  - 将 Dashboard 升级为可交互工作台
  - 为 Relayer / Indexer 增加可查询接口供前端消费

### 已实现

- 已存在可运行的 Anchor program：`programs/policy_pay/`
- 已实现链上指令：
  - `create_policy`
  - `create_intent`
  - `approve_intent`
  - `execute_intent`
  - `settle_intent`
  - `retry_intent`
  - `cancel_intent`
- 已有 Anchor 测试：`tests/policy_pay.ts`
- 已实现的链上最小状态流：
  - `PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 已有最小可运行离链模块：
  - Control Plane MVP
  - Relayer MVP
  - Indexer MVP
  - Dashboard Workbench（交互式）
  - Agent Adapter MVP

### 当前缺口

- `IntentStatus` 中虽然有 `Draft`，但链上尚未落地 Draft 流程
- 批量 intent 链上账户模型尚未实现（当前阶段先落地 control-plane 编排批量）
- Relayer / Indexer 当前仍先用本地 JSON 存储验证闭环
- 最终演示视频仍需按 `demo/DEMO_SCRIPT.md` 录制

## 文档导航

- `docs/architecture.md`：当前实现、目标架构、模块边界与阶段策略
- `docs/delivery-plan.md`：分阶段实施顺序、质量门禁、验收与交付要求
- `docs/guides/quickstart.md`：当前仓库的快速启动指南
- `docs/guides/usage.md`：详细接口与工作台使用说明
- `examples/README.md`：接口调用与 draft 输入示例
- `demo/DEMO_SCRIPT.md`：演示脚本与视频录制建议

## 核心能力目标

1. `Policy` 管理与规则校验（金额上限、白名单、memo 约束）
2. 单笔与批量 `Intent`
3. 人类可读审批与审批留痕
4. Relayer gas sponsor、幂等执行、失败重试
5. Indexer 状态回写与执行追踪
6. Dashboard 全流程操作（创建、审批、追踪、重试）
7. Agent draft（仅草拟，不可越权执行）

## 当前目录说明

```text
programs/
  policy_pay/         # 当前已实现的 Anchor program
migrations/           # Anchor deploy 脚本（当前仍是占位）
tests/                # Anchor TS 测试
docs/                 # 项目文档
app/                  # Dashboard MVP 目录
services/
  control-plane/      # 控制面（单笔/批量编排 + 审计）
  relayer/            # 执行服务（单笔/批量执行 + 状态查询）
  indexer/            # 时间线索引服务（链上/执行来源）
modules/
  agent-adapter/      # draft 适配层（单笔/批量）
examples/             # 接口与输入示例
demo/                 # 演示脚本与视频材料
```

## 快速开始

前置条件：

- Rust + Solana CLI + Anchor CLI
- Node.js 18+
- Yarn

命令：

```bash
yarn install
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
anchor build
# 若本地 8899 端口冲突，可改为独立 validator + deploy 后执行 test:anchor:ts
yarn run test:anchor:ts
yarn run test:control-plane
yarn run test:relayer
yarn run test:indexer
yarn run test:dashboard
yarn run test:agent-adapter
```

说明：

- `wallets/localnet.json` 仅用于本地开发和测试，不会被提交到远端。
- 运行本地 Anchor 测试前，请先启动本地 validator，或在已有本地集群上执行 `solana airdrop` 给测试钱包注资。

## 本地运行各模块

### Control Plane

```bash
yarn run dev:control-plane
```

### Relayer

```bash
yarn run dev:relayer
```

### Dashboard

```bash
yarn run dev:dashboard
```

### Indexer

```bash
yarn run dev:indexer
```

## 当前可演示能力

- 链上策略与 intent 生命周期
- Control Plane 单笔/批量 intent 编排与批量审批
- Relayer 单笔/批量执行记录、失败原因与确认回写
- Indexer 时间线写入与查询过滤
- Dashboard 交互式工作台（创建、批量创建、批量审批、状态面板）
- CSV / 自然语言 draft 单笔与批量解析（强制人工审批）

## 下一步优先事项

1. 评估并落地链上 batch 账户模型
2. 落地更正式的持久化层
3. 增加端到端回归测试与稳定性指标
4. 按 `demo/DEMO_SCRIPT.md` 录制最终 demo 视频
