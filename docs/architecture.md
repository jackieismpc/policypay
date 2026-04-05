# PolicyPay 架构说明（当前基线 + 目标形态）

## 1. 架构目标

PolicyPay 的目标不再只是把 Solana 稳定币转账包装成企业流程系统，而是把支付升级为一个面向 **人类与 AI agents 协作** 的控制平面：

- 有规则约束（Policy）
- 有意图编译（Intent / BatchIntent / Draft）
- 有审批门禁（Human review and authorization）
- 有执行追踪（Execution / Reconciliation）
- 有审计留痕（Audit / Timeline / Proofs）
- 有 AI 编排（结构化提取、风险解释、审批摘要、异常修复建议）
- 有后续可扩展的信任层（Attestation / Agent identity / Reputation）

## 2. 当前默认拓扑

以下描述的是当前代码基线，不代表最终产品能力已经封板。

- 对外单端口：`24100`
- 默认后端入口：`services/policypay-api-rs`
- 技术栈：`Rust + tokio + axum`
- 默认 API 前缀：`/api/v1/*`
- Dashboard：由 Rust 服务根路径 `GET /` 直接提供静态页面

## 3. 模块边界

### 3.1 链上（Onchain）

目录：`programs/policy_pay/`  
技术：`Rust + Anchor`

职责：

- 管理 `PolicyAccount`、`PaymentIntent`、`BatchIntent`
- 约束状态机与权限边界
- 作为最终事实源

### 3.2 统一后端（Unified API）

目录：`services/policypay-api-rs/`  
技术：`Rust + tokio + axum`

职责：

- 统一提供对外 API（`/api/v1/*`）
- 调用链上程序完成业务编排
- 提供幂等、审计、执行记录、时间线
- 提供健康检查与 OpenAPI

### 3.3 前端（Dashboard / Review Console）

目录：`app/static/dashboard.html`

职责：

- 中文业务化操作界面
- 支持单笔付款单、批次流程、审计与状态看板
- 当前作为 Dashboard 使用
- 目标形态将升级为面向人类审阅的 `review console`

### 3.4 适配与测试层（TypeScript）

目录：`tests/`、`modules/agent-adapter/`

职责：

- Anchor 集成测试
- 脚本与适配器能力
- 前端交互与端到端验证

边界：TypeScript 不再承担默认后端核心语义。

### 3.5 领域合同模块（Domain Contract）

目录：`modules/domain/`

职责：

- 提供跨模块共享的领域合同（状态枚举、事件名、错误码）
- 作为 Rust API 与 TS 侧适配器的公共语义源

当前产物：

- `modules/domain/contract.json`
- `modules/domain/src/index.ts`

### 3.6 AI Compiler & Review 模块（规划中）

目录（规划）：`services/policypay-api-rs/src/ai/`

职责：

- 提供统一 AI 能力入口（由 Rust API 编排）
- 封装模型供应商适配层（可替换）
- 输出结构化结果：
  - Intent / Batch Draft 生成（CSV/自然语言/票据 -> Draft）
  - 缺失字段、冲突字段、标准化字段
  - 批次风险评分（risk level + reason）
  - 审批建议（recommendation + confidence + reason code）
  - 失败归因与补救建议
  - 审阅摘要（面向 review console 展示）

边界约束：

- AI 只提供建议，不直接改写链上状态
- 最终执行仍由链上状态机与权限控制
- AI 不可用时必须可降级为“无建议”模式，主流程不阻塞
- Agent Draft 必须带 `requiresHumanApproval=true`，且只能进入草稿态
- 任何 Agent Draft 产物都必须经过人工审批链路（`draft -> pending_approval -> approved`）后才能执行

### 3.7 Trust Plane & Settlement Router（规划中）

目录（规划）：

- `services/policypay-api-rs/src/trust/`
- `services/policypay-api-rs/src/settlement/`

职责：

- 管理预算、角色、审批门槛、收款人类别策略
- 对接 attestation、agent identity、reputation 等可信信号
- 将支付意图路由到真实结算路径
- 支持后续扩展：
  - 直接 Solana 结算
  - 批量支付
  - x402 / MCP tool payments
  - 更广义的 payout / merchant / API payment rails

边界约束：

- 真实资产执行必须由受控 signer / wallet / treasury adapter 完成
- AI 可以建议路由，但不能绕过策略与审批直接执行
- 当前单笔经典 SPL 结算已通过 `/api/v1/intents/:intentId/execute` 接入真实 settlement router；批量与 Token-2022 路径仍待补齐

## 4. API 约定

- 生产与文档统一使用：`/api/v1/*`
- OpenAPI：`/openapi.json`、`/api/v1/openapi.json`
- 旧兼容批量路径（`/intents/batch*`）已移除
- 已提供业务最小输入接口：`POST /api/v1/intents/minimal`、`POST /api/v1/batches/minimal`
- `intentId` / `batchId` / `reference` 等技术字段在接口层由后端代码生成（非链上自动生成，当前已覆盖单笔与批量最小输入场景）
- AI 接口（规划中）将统一纳入：
  - `/api/v1/intake/*`
  - `/api/v1/review/*`
  - `/api/v1/ai/*`
- 后续 agent / x402 / trust 相关接口将纳入：
  - `/api/v1/agent/*`
  - `/api/v1/trust/*`
  - `/api/v1/settlement/*`

当前现状补充：

- `modules/agent-adapter` 已支持 CSV/自然语言生成草稿并强制 `requiresHumanApproval=true`
- 该能力尚未并入 Rust Unified API 默认对外入口，仍属于待接入能力
- 当前执行记录与时间线记录已经覆盖单笔经典 SPL 真实结算结果；批量真实执行、Token-2022 与 AI intake 仍未接入默认主链路

## 5. 存储架构

当前默认：SQLite（`POLICYPAY_SQLITE_PATH`）

设计要求：

- 存储访问按模块化边界实现
- 默认开发/演示为 SQLite
- 后续可平滑替换 PostgreSQL（不改变 API 契约）
- JSON 仅作为本地 fallback，不作为正式部署主存储

## 6. 并发与性能策略

- 运行模型：单进程多线程（tokio runtime）
- 对外模式：单入口单端口
- 链上读写在阻塞任务池中执行，避免阻塞主 reactor
- 端口策略：统一使用 `20000+`，避免核心系统端口冲突

## 7. 测试与质量门禁

默认门禁：

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

说明：`anchor test` 在当前环境存在 validator 启动探测竞态，详见 `docs/guides/anchor-test-stability.md`。

## 8. 非目标（当前阶段）

- 不引入 Tauri 作为主交付形态
- 不继续扩展 legacy TS control-plane 的核心语义
- 不维护双后端并行的长期路径

## 9. 参考文档

- `docs/tech-stack-and-product-roadmap.md`
- `docs/guides/quickstart.md`
- `docs/guides/usage.md`
- `docs/guides/anchor-test-stability.md`
