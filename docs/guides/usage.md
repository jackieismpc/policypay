# PolicyPay Detailed Usage

本文档说明当前默认方案（Rust Unified API）下的详细使用方式。

## 1. 术语映射（业务语义）

- 支付规则编号：`policy`（链上 Policy 账户地址）
- 付款单号：`intentId`
- 批次编号：`batchId`
- 收款地址：`recipient`
- 付款备注：`memo`
- 业务流水号：`reference`

## 2. 默认入口与版本

默认入口：`http://127.0.0.1:24100`

- 版本化：`/api/v1/*`
- OpenAPI：`/openapi.json`、`/api/v1/openapi.json`

## 3. 鉴权（可选）

当设置 `POLICYPAY_API_KEY` 后，写接口（`POST`）需要携带凭据。

二选一：

- `x-api-key: <key>`
- `Authorization: Bearer <key>`

## 4. 单笔付款流程

### 4.1 创建单笔付款单

`POST /api/v1/intents`

```json
{
  "policy": "<policy-pda>",
  "intentId": 101,
  "recipient": "<recipient-pubkey>",
  "amount": 100,
  "memo": "invoice-101",
  "reference": "ref-101"
}
```

### 4.2 创建草稿单

`POST /api/v1/intents/draft`

### 4.3 提交草稿审批

`POST /api/v1/intents/:intentId/submit`

```json
{
  "policy": "<policy-pda>"
}
```

### 4.4 审批单笔

`POST /api/v1/intents/:intentId/approve`

```json
{
  "policy": "<policy-pda>",
  "approvalDigest": [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0
  ]
}
```

说明：`approvalDigest` 可省略，默认 32 字节全 0。

### 4.5 取消 / 重试

- `POST /api/v1/intents/:intentId/cancel`
- `POST /api/v1/intents/:intentId/retry`

```json
{
  "policy": "<policy-pda>"
}
```

## 5. 批量流程（链上 BatchIntent）

1. 创建批次：`POST /api/v1/batches`

```json
{
  "policy": "<policy-pda>",
  "batchId": 5001,
  "mode": "abort-on-error"
}
```

2. 添加明细：`POST /api/v1/batches/:batchId/items`

```json
{
  "policy": "<policy-pda>",
  "intentId": 50011,
  "recipient": "<recipient>",
  "amount": 100,
  "memo": "invoice-50011",
  "reference": "ref-50011"
}
```

3. 提交审批：`POST /api/v1/batches/:batchId/submit`

```json
{
  "policy": "<policy-pda>"
}
```

4. 审批批次：`POST /api/v1/batches/:batchId/approve`

```json
{
  "policy": "<policy-pda>"
}
```

5. 取消批次：`POST /api/v1/batches/:batchId/cancel`

```json
{
  "policy": "<policy-pda>"
}
```

6. 查询批次：`GET /api/v1/policies/:policy/batches/:batchId`

## 6. 观测与运维接口

- `GET /health`
- `GET /api/v1/summary`
- `GET /api/v1/audit-logs`
- `GET /api/v1/executions`
- `GET /api/v1/executions/:intentId`
- `POST /api/v1/executions`
- `POST /api/v1/executions/batch`
- `POST /api/v1/executions/:intentId/confirm`
- `GET /api/v1/timeline`
- `POST /api/v1/timeline/chain`
- `POST /api/v1/timeline/relayer`

## 7. Dashboard 使用说明

Dashboard 地址：`http://127.0.0.1:24100/`

- 页面字段已采用中文业务命名（保留技术字段对照）
- 批量创建支持“每行一条”输入：
  - `付款单号,收款地址,金额,备注,业务流水号`
- 顶部支持可选 API Key 输入（用于对接启用鉴权的环境）

## 8. 测试建议顺序

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

`anchor test` 在部分环境可能卡在 validator 启动探测阶段，详见：`docs/guides/anchor-test-stability.md`。
