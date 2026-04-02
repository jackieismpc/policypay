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

cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test
anchor build
```

说明：

- `anchor test` 在部分环境中存在 validator 启动探测竞态，可能偶发失败。
- 推荐优先使用 `yarn run test:anchor:safe`（独立端口 + 启动健康探测 + deploy + test）。
- 详细分析见：`docs/guides/anchor-test-stability.md`。

## 6. 启动各服务

### Control Plane

```bash
yarn run dev:control-plane
```

默认端口：`24010`

### Relayer

```bash
yarn run dev:relayer
```

默认端口：`24020`

### Indexer

```bash
yarn run dev:indexer
```

默认端口：`24030`

### Dashboard

```bash
yarn run dev:dashboard
```

默认端口：`24040`

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
- `POST /api/intents/batch`
- `POST /api/intents/batch/approve`

### Control Plane

- `GET /health`
- `GET /audit-logs`
- `GET /policies/:mint`
- `GET /policies/:policy/intents/:intentId`
- `POST /intents`
- `POST /intents/batch`
- `POST /intents/:intentId/approve`
- `POST /intents/batch/approve`
- `POST /intents/:intentId/cancel`
- `POST /intents/:intentId/retry`

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
