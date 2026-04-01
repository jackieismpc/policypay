# PolicyPay

PolicyPay 是一个面向团队、企业和 AI Agent 的稳定币支付操作层。

核心闭环：`Intent 生成 -> 人类可读审批 -> Relayer Gasless 执行 -> 全链路审计`。

## 当前仓库状态

- 当前代码仍是 Anchor 初始脚手架（`programs/demo1`）。
- 文档已重构为模块化结构，支持后续按模块替换实现。
- 执行策略已调整为：核心架构与核心功能一开始就定型并打磨完成。

## 文档导航

- `docs/architecture.md`：模块化架构、模块边界、接口契约、可替换策略。
- `docs/delivery-plan.md`：核心功能范围、实施节奏、验收标准。

## 核心能力（首轮必须完整）

1. `Policy` 管理与规则校验（金额上限、白名单、memo 约束）。
2. 单笔与批量 `Intent` 创建。
3. 人类可读审批与审批记录。
4. Relayer gas sponsor、幂等执行、失败重试。
5. Indexer 状态回写与执行追踪。
6. Dashboard 全流程操作（创建、审批、追踪、重试）。
7. Agent draft（仅草拟，不可越权执行）。

## 可后置能力（锦上添花）

- OCR/发票解析。
- 多 relayer 高可用。
- 复杂组织权限系统。
- 高级报表与告警自动化。

## 目录说明

当前目录（核心）：

```text
programs/demo1/     # Anchor scaffold program
migrations/         # Anchor deploy script
tests/              # Anchor TS tests
docs/               # 项目文档
```

目标目录（实施阶段）：

```text
apps/
  dashboard/
services/
  control-plane/
  relayer/
  indexer/
modules/
  domain/
  policy-engine/
  agent-adapter/
programs/
  policy_pay/
docs/
```

## 快速开始

前置条件：

- Rust + Solana CLI + Anchor CLI
- Node.js 18+
- Yarn

命令：

```bash
yarn install
anchor build
anchor test
```

## 近期目标

1. 基于文档将 `demo1` 升级为 `policy_pay`，完成核心状态机与策略约束。
2. 同步落地 Control Plane、Relayer、Indexer、Dashboard、Agent Adapter 核心能力。
3. 在首轮迭代内完成“创建 -> 审批 -> 执行 -> 回写 -> 重试”完整可演示链路。
