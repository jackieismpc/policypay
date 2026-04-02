# PolicyPay

PolicyPay 是面向企业支付场景的「稳定币支付流程层」。

它把原始链上转账动作升级为可管理的业务流程：

`付款单创建 -> 人工审批 -> 链上提交 -> 执行追踪 -> 审计留痕`

## 产品能力

- 付款规则（Policy）约束：金额上限、收款白名单、Memo 规则
- 单笔付款单全生命周期：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批处理全流程：创建批次、加明细、提交审批、审批、取消、查询
- 统一 API：`tokio + axum` 单入口，支持 `/api/*` 与 `/api/v1/*`
- 审计与可观测：审计日志、执行记录、时间线查询
- 模块化存储：默认 SQLite，后续可平滑替换 PostgreSQL
- 面向非技术用户的中文 Dashboard（同时保留 API 直调能力）

## 产品优势

- 审批与执行分离，降低误操作风险
- 链上状态机与离链审计协同，便于合规与追责
- 单进程单入口，部署与运维成本更低
- 默认端口均在 `20000+`，避免占用核心系统端口

## 当前架构（默认）

- 对外单端口：`24100`
- 后端入口：Rust Unified API（`tokio + axum`）
- 链上交互：Rust 直接调用 `policy_pay`（已移除对 legacy control-plane 的运行时依赖）
- 存储：SQLite（默认 `./data/policypay.sqlite`）

## Quick Start

### 前置条件

- Rust toolchain
- Solana CLI
- Anchor CLI
- Node.js 18+
- Yarn

### 1. 安装依赖

```bash
yarn install
```

### 2. 准备本地钱包（仅开发使用）

```bash
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
```

### 3. 构建链上程序

```bash
anchor build
```

### 4. 启动 Rust 统一入口

```bash
yarn run dev:api-rs
```

打开 Dashboard：`http://127.0.0.1:24100/`

### 5. 最小 API 示例

```bash
curl -X POST http://127.0.0.1:24100/api/v1/intents \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "intentId": 101,
    "recipient": "<recipient-pubkey>",
    "amount": 100,
    "memo": "invoice-101",
    "reference": "ref-101"
  }'
```

## 关键配置

- `POLICYPAY_RS_API_PORT`：统一入口端口（默认 `24100`）
- `POLICYPAY_SQLITE_PATH`：SQLite 路径（默认 `./data/policypay.sqlite`）
- `POLICYPAY_RPC_URL` / `SOLANA_RPC_URL`：Solana RPC（默认 `http://127.0.0.1:8899`）
- `POLICYPAY_WALLET_PATH` / `ANCHOR_WALLET`：签名钱包路径（默认 `./wallets/localnet.json`）
- `POLICY_PAY_PROGRAM_ID`：可选，覆盖默认 Program ID
- `POLICYPAY_API_KEY`：可选，启用后写接口需 `x-api-key` 或 `Authorization: Bearer <key>`

## API 文档

- OpenAPI：`GET /openapi.json`、`GET /api/openapi.json`、`GET /api/v1/openapi.json`

## 测试与质量门禁

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

说明：在部分环境中，`anchor test` 可能出现 validator 启动探测卡住。建议优先使用 `yarn run test:anchor:safe`。

## 文档索引

- `docs/guides/quickstart.md`：快速启动
- `docs/guides/usage.md`：详细接口与用法
- `docs/architecture.md`：架构与模块边界
- `docs/guides/anchor-test-stability.md`：Anchor 测试稳定性与排查
- `examples/README.md`：示例
- `demo/DEMO_SCRIPT.md`：演示脚本
