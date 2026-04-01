# PolicyPay 可执行开发清单

这份文档不是 roadmap 概述，而是执行清单。

执行原则：

- 先完成 `P0`
- `P1` 只在 `P0` 稳定后再做
- `P2` 是加分项，不是提交门槛

建议用法：

- 每做完一项就打勾
- 每个里程碑结束都录一次短视频
- 不要在 `P0` 未完成时提前做 polish

## Milestone 0：仓库和环境

- [ ] `P0` 确认 devnet / wallet / USDC dev mint 方案
- [ ] `P0` 确认技术栈：Anchor、Rust、Next.js、Relayer runtime
- [ ] `P0` 建立目录结构草案
- [ ] `P0` 写出最小状态机草图
- [ ] `P0` 写出 demo 脚本草案
- [ ] `P1` 添加 `justfile` 或 `Makefile`
- [ ] `P1` 添加 `.env.example`
- [ ] `P1` 添加本地 seed data 脚本

完成标准：

- 团队知道要做什么
- 知道先做哪一条 happy path
- 知道 demo 最终长什么样

## Milestone 1：链上核心状态机

- [ ] `P0` 定义 `PolicyAccount`
- [ ] `P0` 定义 `PaymentIntent`
- [ ] `P0` 定义 `ApprovalRecord`
- [ ] `P0` 定义 `ExecutionRecord`
- [ ] `P0` 实现 `create_policy`
- [ ] `P0` 实现 `create_intent`
- [ ] `P0` 实现 `record_approval`
- [ ] `P0` 实现 `execute_intent`
- [ ] `P0` 实现 `cancel_intent`
- [ ] `P0` 加入 status transition 校验
- [ ] `P0` 加入 amount / mint / recipient 基本校验
- [ ] `P1` 支持 batch intent
- [ ] `P1` 支持 expiry
- [ ] `P1` 支持 second approval flag
- [ ] `P2` 支持 escrow / refund flow

完成标准：

- devnet 上能创建 intent
- intent 能被审批
- 审批后的 intent 能被 program 执行
- 重复执行会失败

## Milestone 2：Relayer / Paymaster

- [ ] `P0` 创建 relayer service 骨架
- [ ] `P0` 定义 relayer 拉取 approved intent 的逻辑
- [ ] `P0` 构造 token transfer transaction
- [ ] `P0` sponsor gas
- [ ] `P0` 提交交易并拿到 tx signature
- [ ] `P0` 将 `Submitted` 状态写回数据库
- [ ] `P0` 根据链上结果更新 `Confirmed` / `Failed`
- [ ] `P1` 失败重试队列
- [ ] `P1` priority fee / compute budget 参数化
- [ ] `P1` relayer health endpoint
- [ ] `P2` 多 relayer 支持

完成标准：

- 经过审批的 intent 能被自动执行
- 执行成功和失败都能回写
- 对方无需持有 SOL 也能完成 demo

## Milestone 3：Control Plane API

- [ ] `P0` 创建 API service 骨架
- [ ] `P0` `POST /intents`
- [ ] `P0` `GET /intents/:id`
- [ ] `P0` `GET /intents`
- [ ] `P0` `POST /policies`
- [ ] `P0` `GET /policies`
- [ ] `P0` `POST /intents/:id/approve-request`
- [ ] `P0` `GET /executions/:id`
- [ ] `P1` `POST /batches`
- [ ] `P1` webhook 机制
- [ ] `P2` role-based access model

完成标准：

- 前端可以完全依赖 API 操作
- 链上与链下状态关联清晰

## Milestone 4：审批 UX

- [ ] `P0` 设计 approval card UI
- [ ] `P0` 展示 recipient、amount、mint、memo、reference
- [ ] `P0` 显示 “是否由 AI 草拟”
- [ ] `P0` 接入钱包签名
- [ ] `P0` 保存 approval digest
- [ ] `P1` typed message payload 原型
- [ ] `P1` wallet 不支持时的 fallback 流
- [ ] `P2` 双人审批 UI

完成标准：

- 用户能在 UI 中清楚理解自己批准了什么
- 审批记录可追溯

## Milestone 5：Dashboard

- [ ] `P0` 创建 overview 页面
- [ ] `P0` 创建 intent 列表页
- [ ] `P0` 创建 approval queue 页
- [ ] `P0` 创建 execution log 页
- [ ] `P0` 创建 create-intent 表单
- [ ] `P0` 创建 policy form
- [ ] `P1` batch payout 页面
- [ ] `P1` filter / sort / search
- [ ] `P1` failed retry 页面
- [ ] `P2` organization settings 页

完成标准：

- 演示可以完全通过 dashboard 完成
- 不需要切换到命令行做关键操作

## Milestone 6：Agent Assist

- [ ] `P0` 选定输入方式：文本说明或 CSV
- [ ] `P0` 实现 draft generator
- [ ] `P0` 输出结构化 payout proposal
- [ ] `P0` 展示 AI explanation
- [ ] `P0` 明确标识 “AI suggestion only”
- [ ] `P1` policy violation summary
- [ ] `P1` batch grouping suggestion
- [ ] `P2` invoice parser / OCR

完成标准：

- demo 中 AI 能把一个自然语言或 CSV 输入变成 payout draft
- 用户能继续人工审核，不会形成黑箱

## Milestone 7：Indexer / Observability

- [ ] `P0` 监听本项目 program accounts
- [ ] `P0` 记录 confirmed / failed execution
- [ ] `P0` dashboard 展示状态变更
- [ ] `P1` 结构化日志
- [ ] `P1` 按失败原因分类
- [ ] `P1` relayer 成功率指标
- [ ] `P2` webhook / Slack alert

完成标准：

- 出问题时能解释系统为什么失败
- 不是只有“交易没过”这一种信息

## Milestone 8：Solana-specific 加分项

- [ ] `P0` 使用 memo/reference 做对账
- [ ] `P0` 显示 gasless execution 路径
- [ ] `P1` 做 Solana Actions / pay link
- [ ] `P1` 展示 batch payout 的低费用优势
- [ ] `P2` 加入 Token Extensions 方向的扩展预留

完成标准：

- 评委能明确感知“这不是任意链都能照搬”的产品

## Milestone 9：文档和提交物

- [ ] `P0` README 写清楚产品定义
- [ ] `P0` README 写清楚架构和 demo 步骤
- [ ] `P0` 补架构图
- [ ] `P0` 补状态机图
- [ ] `P0` 录产品 demo
- [ ] `P0` 录技术 demo
- [ ] `P0` 写 pitch script
- [ ] `P1` 补 API docs
- [ ] `P1` 补 threat model

完成标准：

- 陌生人看 README 和 demo 就能理解项目

## 交付物清单

提交前必须有这些东西：

- [ ] 可运行前端
- [ ] 可运行 relayer
- [ ] 可部署或可在 devnet 演示的程序
- [ ] 至少 1 个成功 intent 演示
- [ ] 至少 1 个失败后重试演示
- [ ] 至少 1 个 AI draft 演示
- [ ] 清晰的 README
- [ ] 3-4 分钟 demo 视频

## 最小验收脚本

在正式录视频前，必须完整跑过这套脚本：

- [ ] 创建一个 policy
- [ ] 创建三笔 payout intent
- [ ] AI 生成草案
- [ ] 财务审批
- [ ] relayer 自动执行
- [ ] dashboard 显示 confirmed
- [ ] 导出或展示带 memo 的结果
- [ ] 刻意制造一笔失败并演示 retry

## 技术债记录

这些问题允许存在，但必须写在文档里：

- [ ] 目前只支持单组织
- [ ] 目前只支持单一 stablecoin mint
- [ ] 目前只支持单 relayer
- [ ] typed approval 仍是原型实现，不依赖所有钱包原生支持
- [ ] Agent 只支持 draft，不支持自动执行

## 风险清单

- [ ] scope 过大
- [ ] relayer 不稳定
- [ ] 钱包审批体验不够清晰
- [ ] AI 部分喧宾夺主
- [ ] demo 讲太多导致故事分散

每一项都要有具体缓解策略。

## 最终优先级建议

只要时间不够，就按下面顺序砍功能：

先砍：

- `P2`
- 美化 UI
- 多组织
- 双审批
- OCR

最后才考虑砍：

- intent 状态机
- approval UX
- gasless execution
- relayer
- audit log

## 最后一句

如果你必须只把 20% 的功能做完，那就把最重要的 20% 做成一个 **完整且能跑通的闭环**。

对 PolicyPay 来说，这个闭环就是：

**AI 生成付款草案 -> 人类看懂并批准 -> Relayer gasless 执行 -> Dashboard 展示可审计结果。**
