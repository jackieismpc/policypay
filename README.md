# PolicyPay

PolicyPay 是一个面向企业与团队的稳定币支付流程层，用于把“付款请求”变成可审批、可执行、可审计的标准化流程。

核心闭环：`Intent 生成 -> 人类审批 -> 执行提交 -> 状态回写 -> 审计追踪`。

## 产品能力

- 策略控制：金额上限、收款白名单、Memo 规则
- 单笔支付流：支持 `Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批量支付流：支持 `BatchIntent` 草拟、提交审批、审批、取消
- 控制面编排：支持单笔、Draft、兼容批量（循环单笔）与链上 BatchIntent 两套路径
- 执行与重试：失败可追踪并可重试
- 全链路审计：审批、执行、时间线可查询
- Agent Draft：CSV/自然语言生成草稿，强制人工审批前置

## 产品优势

- 审批与执行分离：降低误操作风险
- 链上与离链协同：既有强约束，又有业务可扩展性
- 模块化存储：默认 SQLite，后续可平滑切换 PostgreSQL
- 单端口对外交付：默认对外仅暴露一个入口端口，便于企业部署与网关接入

## 架构形态（当前默认）

- 对外：单端口 `24100`（Rust Unified API，`tokio + axum`）
- 对内：模块化存储（默认 SQLite）+ legacy Control Plane 兼容代理（迁移期）
- 兼容：也支持 Dashboard 网关模式（`24040`）与独立多服务部署（proxy 模式）

## 快速开始

### 前置条件

- Rust 工具链
- Solana CLI
- Anchor CLI
- Node.js 18+
- Yarn

### 安装与构建

```bash
yarn install
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
anchor build
```

### 启动（默认单端口入口，Rust 主导）

```bash
# 终端 1：迁移期仍需运行 legacy control-plane
yarn run dev:control-plane

# 终端 2：启动 Rust 统一入口
yarn run dev:api-rs
```

访问：`http://127.0.0.1:24100/`

## 最小使用示例

创建单笔 intent（通过网关入口）：

```bash
curl -X POST http://127.0.0.1:24100/api/intents \
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

## 配置说明

### 运行模式

- Rust Unified API（默认）：`yarn run dev:api-rs`
- `DASHBOARD_COMPOSITION_MODE=embedded`：Dashboard 单端口内聚模式（TS 兼容模式）
- `DASHBOARD_COMPOSITION_MODE=rust-proxy`：Dashboard 转发到 Rust Unified API
- `DASHBOARD_COMPOSITION_MODE=proxy`：网关代理模式（转发到独立服务）

说明：

- 迁移期下 Rust Unified API 的 intent/batch 编排接口通过 `LEGACY_CONTROL_PLANE_BASE_URL` 代理到 legacy control-plane。

### 端口

- `POLICYPAY_RS_API_PORT`：默认 `24100`
- `DASHBOARD_PORT` 或 `POLICYPAY_PORT`：默认 `24040`（Dashboard 兼容模式）
- 独立服务模式下可使用：
  - `CONTROL_PLANE_PORT`（默认 `24010`）
  - `RELAYER_PORT`（默认 `24020`）
  - `INDEXER_PORT`（默认 `24030`）

### 存储（默认 SQLite）

默认无需配置，自动使用：

- `POLICYPAY_STORAGE_DRIVER=sqlite`
- `POLICYPAY_SQLITE_PATH=./data/policypay.sqlite`

按模块覆盖：

- `CONTROL_PLANE_STORAGE_DRIVER` / `CONTROL_PLANE_SQLITE_PATH`
- `RELAYER_STORAGE_DRIVER` / `RELAYER_SQLITE_PATH`
- `INDEXER_STORAGE_DRIVER` / `INDEXER_SQLITE_PATH`

如需回退 JSON：

```bash
export POLICYPAY_STORAGE_DRIVER=json
```

## 文档索引

- `docs/guides/quickstart.md`：快速启动
- `docs/guides/usage.md`：详细使用与接口说明
- `docs/architecture.md`：架构与模块边界
- `docs/guides/anchor-test-stability.md`：Anchor 稳定测试方案
- `examples/README.md`：API 与链上调用示例
- `demo/DEMO_SCRIPT.md`：产品演示脚本
