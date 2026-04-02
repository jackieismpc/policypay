# PolicyPay 交付计划（当前执行版）

## 1. 目标

在保持 `Rust + Anchor` 主线不变的前提下，把项目收口为可真实部署的企业支付流程产品：

- 技术用户可直接调用 API
- 非技术用户可直接使用 Dashboard
- 链上与离链状态一致、可追踪、可审计

## 2. 当前完成度快照

已完成：

- 链上状态机（Intent / Draft / BatchIntent）
- Rust Unified API（`tokio + axum`）主入口
- SQLite 默认模块化存储
- 中文 Dashboard 基础交互
- Anchor 与 Rust 测试基线
- `anchor test` 启动竞态问题分析与稳定执行脚本

仍需完成：

- 领域模块 `modules/domain`（统一 DTO/状态/错误/事件）
- PostgreSQL 适配层（保持 SQLite 默认）
- 压测与故障恢复回归体系
- 最终演示视频与交付封板

## 3. 阶段拆分

### 阶段 A：收口清理（进行中）

目标：清理兼容路径，把默认链路统一到 Rust API。

验收标准：

- 对外接口统一为 `/api/v1/*`
- 旧兼容批量接口清理完成
- 旧文档中的兼容叙事被合并/移除

### 阶段 B：领域统一（下一阶段）

目标：新增 `modules/domain`，统一跨模块语义。

验收标准：

- 统一状态枚举、错误码、事件名、关键 DTO
- Rust API 与 Dashboard 不再各自维护一套语义

### 阶段 C：生产化增强

目标：面向企业环境的性能、稳定性、可运维能力。

验收标准：

- 并发与故障恢复压测基线形成
- 幂等冲突与恢复场景回归通过
- PostgreSQL 适配层可用（不影响 SQLite 默认开发）

### 阶段 D：交付封板

目标：形成可直接演示与对外交付的完整包。

验收标准：

- README（产品介绍 + Quick Start）完成
- docs（详细使用说明 + 示例）完成
- demo 脚本可复现
- 演示视频完成

## 4. 质量门禁（每阶段）

```bash
cargo fmt --all
cargo clippy -p policypay-api-rs --all-targets -- -D warnings
cargo test
anchor build
yarn run test:anchor:safe
```

说明：`anchor test` 在当前环境存在 validator 启动探测竞态，统一使用 `yarn run test:anchor:safe`。

## 5. 提交与审查规则

- 小改动、分阶段提交
- 每个大阶段 push 前先进行代码审查，修复问题后再次审查
- 凭据、钱包、临时环境文件只保留本地，不推送远端

## 6. 里程碑定义（产品最终形态）

达到以下条件视为产品完成：

- 统一后端入口稳定运行（Rust 单进程多线程，单端口）
- 单笔与批次流程可完整演示
- 审计/执行/时间线可追踪
- API + Dashboard 双交付形态可独立使用
- 文档、示例、demo 视频齐备
