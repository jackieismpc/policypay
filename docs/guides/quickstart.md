# PolicyPay Quickstart Guide

## 适用范围

本指南覆盖当前仓库已落地的最小可运行闭环：

- Anchor onchain program
- Control Plane MVP
- Relayer MVP
- Indexer MVP
- Dashboard Workbench
- Agent Adapter MVP

## 1. 安装依赖

```bash
yarn install
```

## 2. 准备本地测试钱包

```bash
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
```

说明：

- 该钱包仅用于本地开发与测试
- `wallets/` 已被 `.gitignore` 忽略，不会推送到远端

## 3. 构建链上程序

```bash
anchor build
```

当前链上已支持：

- 单笔：`create_intent`、`create_draft_intent`、`submit_draft_intent`、`approve_intent`、`execute_intent`、`settle_intent`、`retry_intent`、`cancel_intent`
- 批量：`create_batch_intent`、`add_batch_item`、`submit_batch_for_approval`、`approve_batch_intent`、`cancel_batch_intent`

## 4. 启动本地 validator

可以使用你自己的 local validator，或用 `solana-test-validator` 启动本地链。

如果测试钱包未注资，请执行：

```bash
solana airdrop 20 "$(solana address -k ./wallets/localnet.json)" --url http://127.0.0.1:8899
```

## 5. 运行测试

```bash
yarn run test:anchor:ts
yarn run test:anchor:safe
yarn run test:control-plane
yarn run test:relayer
yarn run test:indexer
yarn run test:dashboard
yarn run test:agent-adapter
yarn run test:e2e:offchain
yarn run test:api-rs

cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test
anchor build
```

说明：

- `anchor test` 在部分环境中存在 validator 启动探测竞态，可能偶发失败。
- 推荐优先使用 `yarn run test:anchor:safe`（独立端口 + 启动健康探测 + deploy + test）。
- `yarn run test:anchor:safe` 已覆盖单笔 Draft 与 BatchIntent 生命周期测试。
- 详细分析见：`docs/guides/anchor-test-stability.md`。

## 6. 启动方式

### 默认：Rust 单进程单端口（推荐）

```bash
# 终端 1：迁移期仍需运行 legacy control-plane
yarn run dev:control-plane

# 终端 2：启动 Rust 统一入口
yarn run dev:api-rs
```

默认端口：`24100`

说明：

- Rust Unified API 使用 `tokio + axum`，对外只暴露一个端口。
- 默认提供 Dashboard 页面（`GET /`）和统一业务接口（`/api/*`）。
- 审计、幂等、执行、时间线默认使用 SQLite。
- 迁移期下 intent/batch 编排会代理到 legacy control-plane（默认 `http://127.0.0.1:24010`）。

### 可选：Dashboard 网关接入 Rust API（兼容）

```bash
yarn run dev:api-rs
POLICYPAY_API_RS_BASE_URL=http://127.0.0.1:24100 DASHBOARD_COMPOSITION_MODE=rust-proxy yarn run dev:dashboard
```

默认端口：

- Rust Unified API `24100`
- Dashboard `24040`

### 可选：独立多服务模式（兼容）

```bash
yarn run dev:control-plane
yarn run dev:relayer
yarn run dev:indexer
DASHBOARD_COMPOSITION_MODE=proxy yarn run dev:dashboard
```

默认端口：

- Control Plane `24010`
- Relayer `24020`
- Indexer `24030`
- Dashboard `24040`

## 7. 存储配置（默认 SQLite）

默认配置：

- `POLICYPAY_STORAGE_DRIVER=sqlite`
- `POLICYPAY_SQLITE_PATH=./data/policypay.sqlite`

按服务覆盖：

- `CONTROL_PLANE_STORAGE_DRIVER` / `CONTROL_PLANE_SQLITE_PATH`
- `RELAYER_STORAGE_DRIVER` / `RELAYER_SQLITE_PATH`
- `INDEXER_STORAGE_DRIVER` / `INDEXER_SQLITE_PATH`

回退 JSON 存储：

```bash
export POLICYPAY_STORAGE_DRIVER=json
```

## 8. 当前可用接口

### Dashboard

- `GET /`
- `GET /api/summary`
- `GET /api/audit-logs`
- `GET /api/executions`
- `GET /api/timeline`
- `POST /api/intents`
- `POST /api/intents/draft`
- `POST /api/intents/:intentId/submit`
- `POST /api/intents/batch`
- `POST /api/intents/batch/approve`
- `GET /api/policies/:policy/batches/:batchId`
- `POST /api/batches`
- `POST /api/batches/:batchId/items`
- `POST /api/batches/:batchId/submit`
- `POST /api/batches/:batchId/approve`
- `POST /api/batches/:batchId/cancel`

说明：

- Rust 默认模式下，业务调用统一走 Rust Unified API（`/api/*`）。
- Dashboard 模式下，业务调用统一走 Dashboard 网关（`/api/*`）。
- 独立服务模式下，Dashboard 会转发到外部 Control Plane / Relayer / Indexer。

### Control Plane

- `GET /health`
- `GET /audit-logs`
- `GET /policies/:mint`
- `GET /policies/:policy/intents/:intentId`
- `GET /policies/:policy/batches/:batchId`
- `POST /intents`
- `POST /intents/draft`
- `POST /intents/:intentId/submit`
- `POST /intents/batch`
- `POST /intents/:intentId/approve`
- `POST /intents/batch/approve`
- `POST /intents/:intentId/cancel`
- `POST /intents/:intentId/retry`
- `POST /batches`
- `POST /batches/:batchId/items`
- `POST /batches/:batchId/submit`
- `POST /batches/:batchId/approve`
- `POST /batches/:batchId/cancel`

### Relayer

- `GET /health`
- `GET /executions`
- `GET /executions?status=failed|submitted|confirmed`
- `GET /executions/:intentId`
- `POST /executions`
- `POST /executions/batch`
- `POST /executions/:intentId/confirm`

### Indexer

- `GET /health`
- `GET /timeline`
- `GET /timeline?intentId=<id>`
- `GET /timeline?intentId=<id>&source=chain|relayer`
- `POST /timeline/chain`
- `POST /timeline/relayer`

## 9. Agent Draft

当前支持单笔与批量两类 draft 输入：

- CSV：`recipient,amount,memo,reference`
- CSV 多行（批量）
- 自然语言：`recipient amount memo reference...`
- 自然语言分号分段（批量）

所有方式都会生成带 `requiresHumanApproval: true` 的 draft，不能直接越过人工审批进入执行。
