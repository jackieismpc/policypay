# PolicyPay

PolicyPay 是一个面向团队、企业和 AI Agent 的稳定币支付操作层。

核心闭环：`Intent 生成 -> 人类可读审批 -> Relayer Gasless 执行 -> 全链路审计`。

## 当前仓库状态

当前仓库已经不再是纯 Anchor 脚手架。

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

### 当前缺口

- `IntentStatus` 中虽然有 `Draft`，但链上尚未落地 Draft 流程
- 批量 intent 尚未实现
- Control Plane / Relayer / Indexer / Dashboard / Agent Adapter 仍基本未实现
- `app/` 目前为空
- `migrations/deploy.ts` 仍是默认 Anchor 占位脚本
- 链上测试还需要补齐权限边界、非法状态迁移、长度边界、retry 上限和错误码断言

## 文档导航

- `docs/architecture.md`：当前实现、目标架构、模块边界与阶段策略
- `docs/delivery-plan.md`：分阶段实施顺序、质量门禁、验收与交付要求

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
app/                  # 预留前端目录（当前为空）
services/
  control-plane/      # 当前阶段新增的最小控制面
  relayer/            # 当前阶段新增的最小执行服务
  indexer/            # 当前阶段新增的最小时间线索引服务
```

## 推荐实施顺序

1. 先更新文档，对齐当前事实与实施计划
2. 收口链上 Program，并补齐测试缺口
3. 实现 Control Plane MVP
4. 实现 Relayer + Indexer MVP
5. 实现 Dashboard MVP
6. 实现 Agent Adapter Draft MVP
7. 最终更新 README、补 docs、示例和 demo 视频

说明：`Draft` 目前优先作为离链概念处理，待 Agent Adapter 接入后再决定是否链上化。

## 开发与提交流程

- 每个大阶段先更新对应文档，再开始编码
- 每个大阶段按小改动提交 commit
- 每个大阶段 push 前先调用 codex 做代码审查，并修复到无阻断意见
- Rust/Anchor 改动必须带对应测试
- 本地测试凭据、钱包、环境文件不得推送到远端
- 每个大阶段 push 前至少通过：
  - `cargo fmt`
  - `cargo clippy`
  - `anchor build`
  - `cargo test`
  - `anchor test`

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
yarn run test:anchor:local
```

说明：

- `wallets/localnet.json` 仅用于本地开发和测试，不会被提交到远端。
- 运行本地 Anchor 测试前，请先启动本地 validator，或在已有本地集群上执行 `solana airdrop` 给测试钱包注资。

## 近期目标

1. 在现有 `policy_pay` 基础上补齐链上测试与正确性边界
2. 建立最小 Control Plane，统一链上查询、编排与审计
3. 打通 `创建 -> 审批 -> 执行 -> 回写 -> 重试` 的完整可演示闭环
4. 在最终阶段补齐 README、docs、示例与 demo 视频
