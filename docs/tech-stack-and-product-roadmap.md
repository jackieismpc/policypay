# PolicyPay 技术栈决策与产品路线（基线）

版本：v1.0  
日期：2026-04-02

## 1. 文档目标

这份文档用于统一三件事：

- 技术栈最终决策（什么保留、什么冻结、什么移除）
- 产品最终形态定义（我们要交付什么）
- 后续开发路线（按阶段推进到可市场化交付）

## 2. 当前项目现状（代码实况）

已落地的核心：

- 链上：`Rust + Anchor`，`Policy / Intent / BatchIntent` 状态机可运行
- 默认后端入口：`services/policypay-api-rs`（`tokio + axum`）
- 默认存储：SQLite（单文件，模块化）
- 前端：中文 Dashboard（对接统一 API）
- 测试：Rust 单元测试 + Anchor TS 测试 + 前端/链下测试

当前主要问题（已开始收口）：

- 历史兼容路径与新路径并存，接口语义容易漂移
- 文档中存在“已废弃兼容方案”与“当前主方案”混写
- TypeScript 历史后端模块仍在仓库中，容易误导为默认后端
- AI 能力尚未进入统一架构与阶段交付清单，缺少可执行落地路径
- Agent Draft（CSV/自然语言 -> Intent Draft）虽在 `modules/agent-adapter` 有实现与测试，但尚未接入 Rust Unified API 默认链路

## 3. 技术栈最终决策

### 3.1 Onchain（必须保留）

- 技术：`Rust + Anchor`
- 角色：链上事实源（状态机、权限、关键约束）
- 结论：不替换，不弱化

### 3.2 Offchain 默认入口（必须收口）

- 技术：`Rust + tokio + axum`
- 角色：唯一默认后端入口，统一对外 API、幂等、审计、执行、时间线
- API 规范：对外统一 `/api/v1/*`
- 结论：所有新增后端能力只进入 Rust Unified API

### 3.3 TypeScript（保留但边界收窄）

保留范围：

- Dashboard 交互层
- Anchor 测试
- 脚本与适配器（如 agent-adapter）

不再承担：

- 默认主后端语义
- 与 Rust Unified API 重复的核心编排能力

### 3.4 数据库与存储（模块化）

- 默认：SQLite
- 目标：可平滑替换 PostgreSQL（通过 repository/adapter 边界）
- JSON：仅作为本地极简 fallback，不作为正式部署主方案

### 3.5 Tauri 是否适合当前项目

当前结论：暂不引入。

原因：

- 当前交付目标是“Web + API 可直接接入 Solana”的企业服务形态
- Tauri 更适合桌面分发场景，不是当前主战场
- 现阶段引入会增加发布与测试矩阵复杂度，收益不成比例

### 3.6 AI 技术栈决策（新增）

- AI 编排入口：继续放在 Rust Unified API（`tokio + axum`）内部
- AI 模块形态：`provider adapter + prompt template + output schema`（模块化，可替换模型供应商）
- 输出约束：AI 结果只作为“建议/评分/摘要”，不直接替代链上权限判定
- 数据边界：默认不出网持久化敏感原文，AI 调用日志与审计在本地可追踪
- 结论：AI 是增强层，不新增第二后端，不改变 Rust 主入口

## 4. 架构收口原则（从今天开始执行）

1. 单一后端真入口：Rust Unified API。
2. 单一对外 API 风格：版本化 `/api/v1/*`。
3. 兼容路径不再扩展，只允许删除或隔离。
4. 链上状态语义优先，离链只做编排与可观测。
5. 默认单端口（`24100`）对外，所有端口使用 `20000+`。

## 5. 产品最终形态定义（目标）

PolicyPay 最终是一个可直接投入企业场景的 Solana 支付流程层：

- 业务侧提交付款申请（Intent / BatchIntent）
- 人工审批后进入链上执行
- 执行结果与失败原因可追踪
- 审计与时间线可回放
- 技术用户可直接调用 API，非技术用户可用 Dashboard 操作
- AI 提供风险识别、审批建议、运营摘要，但最终动作仍由权限与状态机约束

一句话：**同一套引擎，既能 API 集成，也能可视化操作。**

## 6. 阶段状态与路线（单一计划）

当前状态：

- 阶段 A：已完成（收口兼容 API、统一 Rust 单入口）
- 阶段 B：进行中（`modules/domain` 初版已落地，继续扩展到更多模块）
- 阶段 C：未开始
- 阶段 D：未开始

以下路线既是 roadmap，也是执行计划，不再维护独立 `delivery-plan` 文档。

### 阶段 A：技术栈收口与接口清理（已完成）

目标：彻底移除旧兼容 API 与旧组合入口依赖。

交付：

- 移除旧批量兼容接口（`/intents/batch*`）
- Dashboard 与文档统一到 `/api/v1/*`
- 清理过时文档叙事，保留当前主架构

### 阶段 B：领域模块补齐（modules/domain，进行中）

目标：统一 DTO、状态枚举、错误码、事件命名。

交付：

- `modules/domain` 初版（`contract.json` + TS 类型）已落地
- Rust API 已接入领域合同读取与校验（execution status / timeline source）
- relayer / indexer / Dashboard 字段约束已接入领域合同（batch mode / execution status / timeline source）
- “业务最小输入”接口已落地（单笔 + 批量）：后端自动生成 `batchId` / `intentId` / `reference`
- 继续把更多模块统一到 `modules/domain` 语义定义
- 减少跨模块状态漂移
- AI 领域合同草案：补齐 `riskLevel`、`recommendation`、`reasonCode`、`confidence` 等标准字段定义（供 API/前端统一消费）
- Agent Draft 语义收口：在领域合同/类型中固定 `draftSource`、`requiresHumanApproval=true`、`draftWarnings` 字段语义

### 阶段 C：生产化增强

目标：具备企业可落地能力（高性能、高健壮、低资源）。

交付：

- 性能与并发压测基线
- 故障恢复与幂等冲突回归测试
- PostgreSQL 适配层（不影响 SQLite 默认开发模式）
- 观测指标与告警策略完善
- AI 基础能力落地（第一批）：
  - Agent Draft 接入统一入口：支持 CSV/自然语言转 Intent Draft（单笔/批量）
  - AI/NL 草稿输出统一为“草稿态”，禁止直接创建已审批/已提交意图
  - 规则配置建议：基于历史执行/失败特征生成 Policy 参数建议（建议模式，不自动落库）
  - 批次风险评分：创建批次时输出风险等级和解释文本
  - 审批辅助摘要：对待审批单生成“建议通过/建议驳回 + 解释”
- AI 运行治理：
  - 模型调用超时、重试、熔断与降级（AI 不可用时业务流程可继续）
  - 成本与调用量统计（按接口/租户维度）
  - AI 输出结构化校验（不合法输出直接拒绝进入业务面）
  - 强制人工审批前置：所有 Agent Draft 必须经过 `draft -> pending_approval -> approved` 才可进入链上执行

### 阶段 D：交付封板

目标：形成完整产品交付物。

交付：

- 面向用户的 README（产品能力 + quick start）
- docs 详细使用文档与示例
- 可复现 demo 脚本
- 产品演示视频
- AI 交付封板：
  - Dashboard 提供 CSV/自然语言“生成草稿”入口（对接 Agent Draft）
  - Dashboard 接入 AI 风险提示与审批建议展示
  - API 文档补齐 AI 接口（请求/响应与错误码）
  - Demo 增加“AI 辅助审批”完整链路演示

## 7. 质量门禁（每阶段默认）

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

说明：`anchor test` 在当前环境存在 validator 启动探测竞态，统一使用 `yarn run test:anchor:safe`。

## 8. 提交与审查规则（每阶段默认）

- 小改动分提交，不把多类变更揉在一个提交里
- 每个大阶段 push 前执行代码审查，修复后再次审查
- 本地凭据/钱包/环境文件不推送到远端
- Rust 与 Anchor 变更必须有对应测试

## 9. 最终决策结论

- 核心方向不是“换栈”，而是“收口”。
- `Rust + Anchor`（链上）与 `Rust + tokio + axum`（链下统一入口）是最适合当前项目的主路线。
- TypeScript 应继续服务前端/测试/脚本，不再承担默认后端核心职责。
- 当前阶段应持续删除兼容性包袱，把系统收敛成可持续迭代、可真实部署的企业级产品架构。
