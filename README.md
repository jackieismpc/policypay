# PolicyPay

PolicyPay 是一个面向团队、企业和 AI Agent 的稳定币支付操作层。

核心闭环：`Intent 生成 -> 人类可读审批 -> Relayer Gasless 执行 -> 全链路审计`。

## 当前仓库状态

- 当前代码仍是 Anchor 初始脚手架（`programs/demo1`）。
- 文档已重构为模块化结构，便于后续按模块独立替换实现。
- 目标是先交付可演示最小闭环，再逐步扩展高级能力。

## 文档导航

- `docs/architecture.md`：模块化架构、模块边界、接口契约、可替换策略。
- `docs/delivery-plan.md`：需求范围、优先级、里程碑、验收标准。

## 模块化架构概览

1. `Onchain Program`
- 维护 `Policy`、`Intent`、`Approval`、`Execution` 状态。

2. `Policy Engine`
- 负责规则校验和解释，不直接发起链上执行。

3. `Execution Engine (Relayer)`
- 拉取已批准 intent，代付 gas，提交交易，处理重试。

4. `Control Plane`
- 提供统一 API，管理组织、策略、审批和审计日志。

5. `Dashboard`
- 提供创建、审批、追踪、审计可视化入口。

6. `Agent Adapter`
- 将自然语言或结构化输入转为 draft，不越过人工审批。

7. `Indexer / Observability`
- 回写链上状态，暴露可观测性指标。

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

1. 基于文档把 `demo1` 演进为 `policy_pay` 最小状态机。
2. 增加控制面 API 与 relayer 最小可运行版本。
3. 打通 `创建 intent -> 审批 -> gasless 执行 -> 状态回写` 演示链路。
