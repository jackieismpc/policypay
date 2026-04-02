# PolicyPay

PolicyPay 是一个面向团队、企业和 AI Agent 的稳定币支付操作层。

核心闭环：`Intent 生成 -> 人类可读审批 -> Relayer Gasless 执行 -> 全链路审计`。

## 当前仓库状态

当前仓库已从纯 Anchor 脚手架演进为可运行的端到端最小产品基线（onchain + offchain + dashboard）。

### 已实现能力

- 可运行 Anchor program：`programs/policy_pay/`
- 已实现链上指令：
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
- 已有 Anchor 测试：`tests/policy_pay.ts`
- 链上单笔状态流：
  - `Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 链上批量状态流：
  - `Draft -> PendingApproval -> Approved | Cancelled`
- 已落地离链模块：
  - Control Plane MVP
  - Relayer MVP
  - Indexer MVP
  - Dashboard Workbench（交互式）
  - Agent Adapter MVP
- 数据层已模块化：
  - Control Plane / Relayer / Indexer 支持 `sqlite | json` 双驱动
  - 默认使用 SQLite（共享文件：`data/policypay.sqlite`）
- 本地默认端口已统一到 `20000+`：
  - Control Plane `24010`
  - Relayer `24020`
  - Indexer `24030`
  - Dashboard `24040`

### 当前缺口

- Control Plane 当前批量编排仍默认走多次 `create_intent` 调用，尚未切到链上 `BatchIntent` 指令编排
- 仍需增加更完整的端到端回归测试（多服务并行 + 重试场景）
- 最终演示视频仍需按 `demo/DEMO_SCRIPT.md` 录制

## 文档导航

- `docs/architecture.md`：当前实现、目标架构、模块边界与阶段策略
- `docs/delivery-plan.md`：分阶段实施顺序、质量门禁、验收与交付要求
- `docs/guides/quickstart.md`：快速启动指南
- `docs/guides/usage.md`：详细接口与环境配置说明
- `docs/guides/anchor-test-stability.md`：Anchor 测试稳定执行方案
- `examples/README.md`：接口调用与 draft 输入示例
- `demo/DEMO_SCRIPT.md`：演示脚本与讲解顺序
- `demo/VIDEO_GUIDE.md`：视频录制与交付建议

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

# 可选：链上 TS 测试
yarn run test:anchor:ts
yarn run test:anchor:safe

# 离链服务测试
yarn run test:control-plane
yarn run test:relayer
yarn run test:indexer
yarn run test:dashboard
yarn run test:agent-adapter
yarn run test:e2e:offchain
```

说明：

- `wallets/localnet.json` 仅用于本地开发与测试，不会被推送到远端。
- `wallets/`、`data/`、`*.sqlite*` 均已加入 `.gitignore`。

## 本地启动

```bash
yarn run dev:control-plane
yarn run dev:relayer
yarn run dev:indexer
yarn run dev:dashboard
```

访问 Dashboard：`http://127.0.0.1:24040/`

## 存储配置（默认 SQLite）

默认不需要任何环境变量，服务会自动使用：

- `POLICYPAY_STORAGE_DRIVER=sqlite`
- `POLICYPAY_SQLITE_PATH=./data/policypay.sqlite`

可选覆盖（按服务粒度）：

- `CONTROL_PLANE_STORAGE_DRIVER` / `CONTROL_PLANE_SQLITE_PATH`
- `RELAYER_STORAGE_DRIVER` / `RELAYER_SQLITE_PATH`
- `INDEXER_STORAGE_DRIVER` / `INDEXER_SQLITE_PATH`

如需回退 JSON 存储，可设置：

```bash
export POLICYPAY_STORAGE_DRIVER=json
```

## 快速演示入口

- API 示例：`examples/README.md`
- 演示顺序：`demo/DEMO_SCRIPT.md`
- 一键演示脚本：`demo/live_demo.sh`
- Anchor 稳定测试：`docs/guides/anchor-test-stability.md`

## 下一步优先事项

1. 为 Control Plane 增加链上 `Draft` / `BatchIntent` 编排入口
2. 增加跨服务端到端回归测试（并发与故障恢复）
3. 完成最终产品 demo 视频并归档演示材料
