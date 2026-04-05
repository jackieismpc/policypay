# PolicyPay

PolicyPay 不是“加了 AI 的企业支付后台”，而是一个面向 **人类与 AI agents 协作** 的 `Solana-first payment orchestration layer`。

它的目标不是只让人类更方便地点按钮，而是让 AI 负责：

- 理解支付意图
- 编译结构化草稿
- 匹配策略与预算
- 生成审阅材料
- 给出执行与修复建议

最终由人类做审阅与授权。

## 当前代码已经实现的能力

- 付款规则（Policy）约束：金额上限、收款白名单、Memo 规则
- 单笔付款单全生命周期：`Draft -> PendingApproval -> Approved -> Submitted -> Confirmed | Failed | Cancelled`
- 批处理全流程：创建批次、加明细、提交审批、审批、取消、查询
- 统一 API：`tokio + axum` 单入口，统一版本化路径 `/api/v1/*`
- 审计与可观测：审计日志、执行记录、时间线查询
- 模块化存储：默认 SQLite，后续可平滑替换 PostgreSQL
- 面向非技术用户的中文 Dashboard（同时保留 API 直调能力）
- 领域合同：`modules/domain` 已统一状态枚举、事件名、错误码
- Agent Draft 原型：`modules/agent-adapter` 已支持 CSV / 自然语言草稿解析，并强制 `requiresHumanApproval=true`

## 当前最重要的现实边界

- 当前已经打通单笔 `Approved -> Execute -> Confirmed` 的真实经典 SPL 结算路径，`/executions*` 与 `/timeline` 现在记录的是实际执行结果与观测信息
- 当前真实结算能力仍然只覆盖经典 SPL token；`Token-2022`、批量真实结算、更多路由策略还没有完成
- AI 能力还没有进入统一 API 主链路，现阶段仍属于原型与路线规划

这意味着仓库已经从“支付控制平面骨架”进入“首条真实可用结算链路已落地”的阶段，但距离“完整可投产的 AI-native 支付底座”仍然还差批量结算、Token-2022、AI 主链路和 trust plane。

## 产品方向

从现在开始，PolicyPay 的主方向不是继续做一个普通业务系统，而是做三层能力：

- `Intent Compiler`：把自然语言、CSV、票据、API 请求编译成结构化支付意图
- `Policy & Trust Plane`：预算、权限、风控、attestation、agent 信任与人工审批
- `Settlement Router`：真实 Solana 结算、批量支付、后续 x402 / MCP / agentic payments 扩展

更完整的重构分析与路线见：

- `docs/tech-stack-and-product-roadmap.md`

## 当前架构（默认）

- 对外单端口：`24100`
- 后端入口：Rust Unified API（`tokio + axum`）
- 链上交互：Rust 直接调用 `policy_pay`（已移除对 legacy control-plane 的运行时依赖）
- 存储：SQLite（默认 `./data/policypay.sqlite`）

说明：当前仓库已有 `modules/agent-adapter` 的 CSV/自然语言草稿解析与 `requiresHumanApproval=true` 约束，但尚未接入 Rust 统一 API 默认入口。

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

说明：批量场景中每条明细只需 `recipient + amount + memo`；`batchId`、`intentId`、`reference` 由后端自动生成。

```bash
curl -X POST http://127.0.0.1:24100/api/v1/intents/<intent-id>/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>"
  }'
```

说明：该接口会执行真实经典 SPL 转账，并把执行结果同步写入 execution record 与 timeline。

## 关键配置

- `POLICYPAY_RS_API_PORT`：统一入口端口（默认 `24100`）
- `POLICYPAY_SQLITE_PATH`：SQLite 路径（默认 `./data/policypay.sqlite`）
- `POLICYPAY_RPC_URL` / `SOLANA_RPC_URL`：Solana RPC（默认 `http://127.0.0.1:8899`）
- `POLICYPAY_WALLET_PATH` / `ANCHOR_WALLET`：签名钱包路径（默认 `./wallets/localnet.json`）
- `POLICY_PAY_PROGRAM_ID`：可选，覆盖默认 Program ID
- `POLICYPAY_API_KEY`：可选，启用后写接口需 `x-api-key` 或 `Authorization: Bearer <key>`

## API 文档

- OpenAPI：`GET /openapi.json`、`GET /api/v1/openapi.json`

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

- `docs/tech-stack-and-product-roadmap.md`：AI-native 重构分析、技术栈决策与产品路线
- `docs/guides/quickstart.md`：快速启动
- `docs/guides/usage.md`：详细接口与用法
- `docs/architecture.md`：架构与模块边界
- `docs/guides/anchor-test-stability.md`：Anchor 测试稳定性与排查
- `examples/README.md`：示例
- `demo/DEMO_SCRIPT.md`：演示脚本
