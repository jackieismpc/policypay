# PolicyPay Quickstart

本文档给出当前默认架构的最短上手路径：

- 单进程、单端口 Rust Unified API（`tokio + axum`）
- 后端入口直连链上程序（不依赖 legacy control-plane）
- 默认模块化存储 SQLite

## 1. 环境要求

- Rust toolchain
- Solana CLI
- Anchor CLI
- Node.js 18+
- Yarn

## 2. 安装依赖

```bash
yarn install
```

## 3. 准备本地钱包

```bash
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
```

说明：`wallets/` 已在 `.gitignore` 中，默认不会被推送。

## 4. 构建链上程序

```bash
anchor build
```

## 5. 启动 API（默认入口）

```bash
yarn run dev:api-rs
```

默认地址：`http://127.0.0.1:24100`

可访问：

- Dashboard：`GET /`
- 版本化 API：`/api/v1/*`
- OpenAPI：`/openapi.json`、`/api/v1/openapi.json`

## 6. 最小调用示例

创建单笔付款单：

```bash
curl -X POST http://127.0.0.1:24100/api/v1/intents/minimal \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "recipient": "<recipient-pubkey>",
    "amount": 100,
    "memo": "invoice-101"
  }'
```

说明：`memo` 可省略，默认空字符串；`intentId` 与 `reference` 由后端自动生成。

创建批量付款（最小输入）：

```bash
curl -X POST http://127.0.0.1:24100/api/v1/batches/minimal \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "items": [
      { "recipient": "<recipient-a>", "amount": 100, "memo": "invoice-201" },
      { "recipient": "<recipient-b>", "amount": 250 }
    ]
  }'
```

说明：每条明细只需 `recipient + amount + memo`；`batchId`、`intentId`、`reference` 由后端自动生成。

## 7. 关键配置

- `POLICYPAY_RS_API_PORT`：默认 `24100`
- `POLICYPAY_SQLITE_PATH`：默认 `./data/policypay.sqlite`
- `POLICYPAY_RPC_URL` / `SOLANA_RPC_URL`：默认 `http://127.0.0.1:8899`
- `POLICYPAY_WALLET_PATH` / `ANCHOR_WALLET`：默认 `./wallets/localnet.json`
- `POLICY_PAY_PROGRAM_ID`：可选，覆盖默认 Program ID
- `POLICYPAY_API_KEY`：可选，启用后写接口需 `x-api-key` 或 `Authorization: Bearer <key>`

## 8. 测试与门禁

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

说明：当前环境下 `anchor test` 可能出现 validator 启动探测卡住，建议优先使用 `yarn run test:anchor:safe`。
