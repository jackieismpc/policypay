# PolicyPay 架构说明（当前基线）

## 1. 架构目标

PolicyPay 的目标是把 Solana 稳定币转账升级为企业可用的流程系统：

- 有规则约束（Policy）
- 有审批门禁（Intent / BatchIntent）
- 有执行追踪（Execution）
- 有审计留痕（Audit / Timeline）

## 2. 当前默认拓扑

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

### 3.3 前端（Dashboard）

目录：`app/static/dashboard.html`

职责：

- 中文业务化操作界面
- 支持单笔付款单、批次流程、审计与状态看板
- 同时服务技术与非技术用户

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

## 4. API 约定

- 生产与文档统一使用：`/api/v1/*`
- OpenAPI：`/openapi.json`、`/api/v1/openapi.json`
- 旧兼容批量路径（`/intents/batch*`）已移除
- `intentId` / `batchId` / `reference` 等技术字段未来由后端代码层自动生成（非链上自动生成）

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
