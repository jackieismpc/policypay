# PolicyPay Detailed Usage

本文档描述当前仓库已经落地的完整可用路径：

- 链上 program（Policy + PaymentIntent）
- Control Plane（单笔/批量编排 + 审计）
- Relayer（单笔/批量执行 + 确认）
- Indexer（时间线写入与查询）
- Dashboard（交互式工作台）
- Agent Adapter（单笔/批量 draft）

## 1. 启动顺序

1. 启动本地 validator（或使用已有 localnet）
2. 构建并部署程序
3. 启动服务：Control Plane / Relayer / Indexer / Dashboard
4. 打开 Dashboard 执行操作

## 2. 本地命令

```bash
yarn install
anchor build

# 按你的环境部署（示例）
anchor deploy

# 启动服务
yarn run dev:control-plane
yarn run dev:relayer
yarn run dev:indexer
yarn run dev:dashboard
```

## 3. Control Plane

默认地址：`http://127.0.0.1:4010`

### 3.1 查询接口

- `GET /health`
- `GET /audit-logs`
- `GET /policies/:mint`
- `GET /policies/:policy/intents/:intentId`

### 3.2 单笔编排

- `POST /intents`
- `POST /intents/:intentId/approve`
- `POST /intents/:intentId/cancel`
- `POST /intents/:intentId/retry`

### 3.3 批量编排

- `POST /intents/batch`
  - `mode`: `abort-on-error` 或 `continue-on-error`
  - `items`: intent 列表
- `POST /intents/batch/approve`
  - `intentIds`: intent id 列表
  - `approvalDigest` 可选（默认 32 字节全 0）

## 4. Relayer

默认地址：`http://127.0.0.1:4020`

### 4.1 查询接口

- `GET /health`
- `GET /executions`
- `GET /executions?status=failed|submitted|confirmed`
- `GET /executions/:intentId`

### 4.2 执行接口

- `POST /executions`
- `POST /executions/batch`
- `POST /executions/:intentId/confirm`

`POST /executions/batch` 同样支持：

- `mode`: `abort-on-error` / `continue-on-error`

## 5. Indexer

默认地址：`http://127.0.0.1:4040`

### 5.1 查询接口

- `GET /health`
- `GET /timeline`
- `GET /timeline?intentId=101`
- `GET /timeline?intentId=101&source=chain`

### 5.2 写入接口

- `POST /timeline/chain`
- `POST /timeline/relayer`

## 6. Dashboard

默认地址：`http://127.0.0.1:4030`

工作台能力：

- 创建单笔 intent
- 批量创建 intent
- 批量审批 intent
- 查看摘要、审计日志、执行记录、时间线

Dashboard 内部代理接口：

- `GET /api/summary`
- `GET /api/audit-logs`
- `GET /api/executions`
- `GET /api/timeline`
- `POST /api/intents`
- `POST /api/intents/batch`
- `POST /api/intents/batch/approve`

## 7. Agent Adapter

模块路径：`modules/agent-adapter/`

已支持：

- `parseCsvDraft`
- `parseNaturalLanguageDraft`
- `parseCsvBatchDraft`
- `parseNaturalLanguageBatchDraft`
- `assertHumanApprovalRequired`

所有输出都包含 `requiresHumanApproval: true`。

## 8. 测试建议顺序

```bash
yarn run test:control-plane
yarn run test:relayer
yarn run test:indexer
yarn run test:dashboard
yarn run test:agent-adapter

cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test
anchor build
```

如果 `anchor test` 因本地 RPC 端口被占用或 validator 状态问题失败，优先使用独立 validator 端口进行 `anchor deploy` + `test:anchor:ts`。
