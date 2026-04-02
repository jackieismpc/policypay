# PolicyPay Detailed Usage

本文档描述当前仓库已经落地的完整可用路径：

- 链上 program（Policy + PaymentIntent + BatchIntent）
- Control Plane（单笔/批量编排 + 审计）
- Relayer（单笔/批量执行 + 确认）
- Indexer（时间线写入与查询）
- Dashboard（交互式工作台）
- Agent Adapter（单笔/批量 draft）

## 1. 启动顺序

1. 启动本地 validator（或使用已有 localnet）
2. 构建并部署程序
3. 启动 Dashboard（默认单端口组合模式）
4. 打开 Dashboard 执行操作（或调用 `/api/*`）

## 2. 本地命令

```bash
yarn install
anchor build

# 按你的环境部署（示例）
anchor deploy

# 启动单端口网关（默认）
yarn run dev:dashboard
```

## 3. 默认地址与端口（20000+）

- 对外入口（默认）：`http://127.0.0.1:24040`
- 独立服务模式（proxy）可选端口：
  - Control Plane `24010`
  - Relayer `24020`
  - Indexer `24030`

### 3.1 组合模式配置

- `DASHBOARD_COMPOSITION_MODE=embedded`：默认单端口内聚模式
- `DASHBOARD_COMPOSITION_MODE=proxy`：转发到外部服务
- `DASHBOARD_PORT` 或 `POLICYPAY_PORT`：网关端口（默认 `24040`）

## 4. 存储配置（模块化）

默认：SQLite

- `POLICYPAY_STORAGE_DRIVER=sqlite`
- `POLICYPAY_SQLITE_PATH=./data/policypay.sqlite`

按服务覆盖：

- Control Plane: `CONTROL_PLANE_STORAGE_DRIVER` / `CONTROL_PLANE_SQLITE_PATH`
- Relayer: `RELAYER_STORAGE_DRIVER` / `RELAYER_SQLITE_PATH`
- Indexer: `INDEXER_STORAGE_DRIVER` / `INDEXER_SQLITE_PATH`

切换 JSON：

```bash
export POLICYPAY_STORAGE_DRIVER=json
```

### 4.1 链上新增能力（Draft + BatchIntent）

单笔指令新增：

- `create_draft_intent`
- `submit_draft_intent`

批量指令新增：

- `create_batch_intent`
- `add_batch_item`
- `submit_batch_for_approval`
- `approve_batch_intent`
- `cancel_batch_intent`

状态机：

- 单笔：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批量：`Draft -> PendingApproval -> Approved | Cancelled`

## 5. Control Plane

默认地址：`http://127.0.0.1:24010`

### 5.1 查询接口

- `GET /health`
- `GET /audit-logs`
- `GET /policies/:mint`
- `GET /policies/:policy/intents/:intentId`
- `GET /policies/:policy/batches/:batchId`

### 5.2 单笔编排

- `POST /intents`
- `POST /intents/draft`
- `POST /intents/:intentId/submit`
- `POST /intents/:intentId/approve`
- `POST /intents/:intentId/cancel`
- `POST /intents/:intentId/retry`

### 5.3 批量编排

- `POST /intents/batch`
  - `mode`: `abort-on-error` 或 `continue-on-error`
  - `items`: intent 列表
- `POST /intents/batch/approve`
  - `intentIds`: intent id 列表
  - `approvalDigest` 可选（默认 32 字节全 0）
- `POST /batches`
  - `batchId`: batch id
  - `mode`: `abort-on-error` 或 `continue-on-error`
- `POST /batches/:batchId/items`
- `POST /batches/:batchId/submit`
- `POST /batches/:batchId/approve`
- `POST /batches/:batchId/cancel`

说明：

- 当前 Control Plane 的批量接口默认兼容旧模式（循环调用 `create_intent` / `approve_intent`）。
- 链上 `BatchIntent` 已可直接通过 `/batches/*` 接口编排。

## 6. Relayer

默认地址：`http://127.0.0.1:24020`

### 6.1 查询接口

- `GET /health`
- `GET /executions`
- `GET /executions?status=failed|submitted|confirmed`
- `GET /executions/:intentId`

### 6.2 执行接口

- `POST /executions`
- `POST /executions/batch`
- `POST /executions/:intentId/confirm`

`POST /executions/batch` 同样支持：

- `mode`: `abort-on-error` / `continue-on-error`

## 7. Indexer

默认地址：`http://127.0.0.1:24030`

### 7.1 查询接口

- `GET /health`
- `GET /timeline`
- `GET /timeline?intentId=101`
- `GET /timeline?intentId=101&source=chain`

### 7.2 写入接口

- `POST /timeline/chain`
- `POST /timeline/relayer`

## 8. Dashboard

默认地址：`http://127.0.0.1:24040`

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

- `embedded` 模式下，Dashboard 会在同进程挂载 Control Plane / Relayer / Indexer。
- `proxy` 模式下，Dashboard 会转发到 `CONTROL_PLANE_BASE_URL` / `RELAYER_BASE_URL` / `INDEXER_BASE_URL`。

## 9. Agent Adapter

模块路径：`modules/agent-adapter/`

已支持：

- `parseCsvDraft`
- `parseNaturalLanguageDraft`
- `parseCsvBatchDraft`
- `parseNaturalLanguageBatchDraft`
- `assertHumanApprovalRequired`

所有输出都包含 `requiresHumanApproval: true`。

## 10. 测试建议顺序

```bash
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

如果需要排查 `anchor test` 启动竞态和端口冲突问题，请参考：`docs/guides/anchor-test-stability.md`。
