# Demo Script

## 目标

用最短路径演示 PolicyPay 当前可交付基线已经打通：

- 单笔 + 批量 intent 编排
- 批量审批
- Relayer 批量执行
- Indexer 时间线查询
- Dashboard 交互式工作台
- SQLite 默认存储（可切 JSON）

## 演示前准备

1. 启动服务：
   - `yarn run dev:control-plane`
   - `yarn run dev:relayer`
   - `yarn run dev:indexer`
   - `yarn run dev:dashboard`
2. 打开 Dashboard：`http://127.0.0.1:24040/`
3. 可选：先运行 `demo/live_demo.sh` 预热数据

## 演示顺序

1. 展示 Dashboard Workbench
   - 访问 `http://127.0.0.1:24040/`
   - 展示三个操作区：单笔创建、批量创建、批量审批
   - 点击“刷新全部面板”展示 summary / audit / executions / timeline

2. 展示链上能力
   - 说明当前 onchain program 支持：
     - `create_policy`
     - `create_intent`
     - `create_draft_intent`
     - `submit_draft_intent`
     - `create_batch_intent`
     - `add_batch_item`
     - `submit_batch_for_approval`
     - `approve_batch_intent`
     - `cancel_batch_intent`
     - `approve_intent`
     - `execute_intent`
     - `settle_intent`
     - `retry_intent`
     - `cancel_intent`

3. 展示测试通过
   - 运行：
     - `yarn run test:anchor:safe`
     - `yarn run test:control-plane`
     - `yarn run test:relayer`
     - `yarn run test:indexer`
     - `yarn run test:dashboard`
     - `yarn run test:agent-adapter`
     - `cargo test`

4. 展示 Control Plane
   - 访问 `/health`
   - 访问 `/audit-logs`
   - 演示 `POST /intents/batch` 和 `POST /intents/batch/approve`

5. 展示 Relayer / Indexer
   - 演示 `POST /executions/batch`
   - 演示 `GET /executions?status=failed`
   - 演示 `GET /timeline?intentId=<id>&source=relayer`

6. 展示 Agent draft
   - 输入单行 CSV -> 单笔 draft
   - 输入多行 CSV -> 批量 draft
   - 强调 `requiresHumanApproval: true`

7. 总结当前成型状态
   - 链上主流程稳定
   - 控制面/执行层/索引层可联动
   - Dashboard 可直接操作并观测状态
   - 默认端口统一到 `20000+`
   - 存储层默认 SQLite，支持模块化切换

## 视频录制建议

- 录屏分辨率：1440p 或 1080p
- 时长控制：4-6 分钟
- 建议结构：
  1. 产品介绍（30s）
  2. 环境与测试（90s）
  3. Dashboard 工作台操作（150s）
  4. 收尾总结（30s）

## 建议镜头脚本

1. 先展示 `README.md` 的产品定位和快速开始。
2. 切到 Dashboard，完成一次单笔创建 + 一次批量创建。
3. 切到 API 终端，演示批量审批、批量执行和时间线查询。
4. 回到 Dashboard，刷新并展示状态变化。
5. 最后展示 `examples/README.md` 和 `docs/guides/usage.md`，说明可复现性。
