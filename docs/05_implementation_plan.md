# PolicyPay 实施计划

## 执行摘要

**项目定位**：稳定币支付操作层（不是支付应用）- 为企业和 AI Agent 提供可控的支付能力

**核心价值**：AI 生成付款意图 → 人类可读审批 → Gasless 执行 → 完整审计

**当前状态**：文档完整，代码实现 0%

**关键调整**：原方案过于复杂（6个模块），调整为4个核心模块的最小闭环

---

## 方案可行性评估

### ❌ 原方案问题

文档定义的完整方案包含：
- 9个里程碑，每个10-15个任务
- 6个独立模块（Program、Relayer、API、Dashboard、Agent、Indexer）
- 需要4种技术栈完整集成

**结论**：对黑客松时间来说不现实，必须简化。

### ✅ 调整后方案

**最小可演示闭环**：
1. Anchor Program（简化状态机）
2. TypeScript Relayer（gasless 执行）
3. Next.js Dashboard（审批界面）
4. AI Assist（极简版）

**砍掉的部分**：
- 独立的 Control Plane API（合并到 Dashboard 后端）
- 复杂的 Indexer（用简单轮询）
- 复杂的 Policy Engine（只做金额检查）
- Batch、二次审批、多组织等高级功能

---

## 技术栈选择

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| 链上程序 | **Anchor** | 快速开发，符合评委期望 |
| Relayer | **TypeScript** | 与 web3.js 集成快，开发速度快 |
| 前端 | **Next.js + Tailwind** | 标准栈，快速 UI |
| 数据库 | **SQLite** | 零配置，demo 稳定 |
| AI | **OpenAI/Anthropic API** | 不自建模型 |
| 钱包 | **Wallet Adapter** | 标准集成 |

---

## 12天实施计划

### Phase 1: 核心链上状态机（Day 1-3）

**目标**：能在 devnet 上创建和执行 intent

#### Day 1-2: Anchor Program
```rust
// 账户结构（简化版）
- PolicyAccount: authority, mint, daily_limit
- PaymentIntent: recipient, amount, status, memo, reference

// 指令
- create_policy
- create_intent
- execute_intent

// 状态机
Draft → Approved → Executed
```

**关键简化**：
- 不做 ApprovalRecord 和 ExecutionRecord 账户（用 event）
- 不做复杂 policy 校验（只检查金额上限）
- 不做 batch、expiry、second approval

#### Day 3: 测试和部署
- 单元测试
- Devnet 部署
- CLI 验证

**验收标准**：能用 CLI 创建 policy 和 intent，并执行成功

---

### Phase 2: Relayer 核心（Day 4-5）

**目标**：自动拉取 approved intent 并 sponsor gas 执行

#### Day 4: Relayer 基础
```typescript
// 核心功能
- 监听 approved intents（简单轮询，5秒间隔）
- 构造 SPL token transfer
- Sponsor gas 并提交
```

#### Day 5: 状态管理
```typescript
// SQLite 表
- intents: id, recipient, amount, status, tx_sig, created_at
- execution_logs: intent_id, result, error, timestamp

// 重试逻辑
- 最多3次，指数退避
```

**关键简化**：
- 不做复杂队列系统（Redis）
- 不做 priority fee 优化
- 不做多 relayer 支持

**验收标准**：Relayer 能自动检测 approved intent 并执行，记录 tx signature

---

### Phase 3: Dashboard 最小版（Day 6-8）

**目标**：能演示完整流程的 Web 界面

#### Day 6: 基础页面
```typescript
// 页面
- /: Intent 列表（显示 status、amount、recipient）
- /create: 创建 intent 表单
- 钱包连接（Wallet Adapter）
```

#### Day 7: 审批 UX
```typescript
// ApprovalCard 组件
- 显示：recipient、amount、memo、reference
- 标识："AI 建议" 或 "手动创建"
- 签名流程：signMessage（不等 typed message 标准）
- 提交到链上：调用 execute_intent
```

#### Day 8 上午: 执行日志
```typescript
// ExecutionLog 页面
- 显示 intent 状态变化
- 显示 Solana Explorer 链接
- 成功/失败标识
```

**关键简化**：
- 不做 filter/sort/search
- 不做 policy 编辑器
- 不做 organization settings

**验收标准**：能在浏览器中完成：创建 intent → 审批 → 查看执行结果

---

### Phase 4: AI Assist 极简版（Day 8下午-9）

**目标**：展示 AI 辅助但不越权

#### Day 8 下午-Day 9
```typescript
// AI Draft 功能
- 输入框：自然语言描述（"支付 100 USDC 给 Alice 用于发票 #123"）
- 调用 LLM API 生成结构化 intent
- 显示 "AI 建议" 标签
- 人类必须 review 和 approve
```

**关键简化**：
- 不做 CSV 解析
- 不做 policy violation 检查
- 不做 batch grouping

**验收标准**：能用自然语言生成 intent，但必须经过人类审批

---

### Phase 5: 集成和 Demo 准备（Day 10-12）

#### Day 10: 端到端集成
- 打通完整流程（AI → 审批 → 执行 → 日志）
- 修复集成 bug
- 准备 demo 数据（3个示例 intent）

#### Day 11: Solana 特色展示
- 添加 memo/reference 支持
- 展示 gasless 路径（显示 relayer 支付 gas）
- 准备对比说明（为什么是 Solana）

#### Day 12: Polish 和录制
- UI 美化（最小必要）
- 录制 demo 视频（3-4分钟）
- 准备 pitch 脚本

**验收标准**：
- Demo 视频一次录制成功
- 能在 30 秒内让陌生人理解这不是支付 app

---

## 目录结构

```
policypay/
├── programs/
│   └── policy-pay/              # Anchor program
│       ├── src/
│       │   ├── lib.rs           # 指令定义
│       │   ├── state.rs         # PolicyAccount, PaymentIntent
│       │   └── instructions/
│       │       ├── create_policy.rs
│       │       ├── create_intent.rs
│       │       └── execute_intent.rs
│       └── Cargo.toml
├── relayer/                     # TypeScript relayer
│   ├── src/
│   │   ├── index.ts             # 主入口
│   │   ├── monitor.ts           # 监听 intents
│   │   ├── executor.ts          # 执行交易
│   │   └── db.ts                # SQLite 操作
│   ├── package.json
│   └── database.sqlite
├── app/                         # Next.js dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Intent 列表
│   │   │   ├── create/page.tsx  # 创建 intent
│   │   │   └── approve/page.tsx # 审批页面
│   │   ├── components/
│   │   │   ├── ApprovalCard.tsx # 核心审批 UI
│   │   │   ├── IntentList.tsx
│   │   │   └── WalletButton.tsx
│   │   └── lib/
│   │       ├── solana.ts        # Program 交互
│   │       └── ai.ts            # AI draft 生成
│   └── package.json
├── scripts/
│   ├── setup-devnet.ts          # 初始化脚本
│   └── seed-data.ts             # Demo 数据
├── docs/                        # 保留现有文档
│   ├── 01_project_recommendation.md
│   ├── 02_architecture.md
│   ├── 03_requirements_vision_and_final_form.md
│   ├── 04_development_checklist.md
│   └── 05_implementation_plan.md
└── README.md
```

---

## 优先级定义

### P0（必须完成）- 核心闭环
1. ✅ Intent 状态机（链上）
2. ✅ Gasless execution（Relayer）
3. ✅ Human-readable approval（Dashboard）
4. ✅ 基础 AI draft（Agent Assist）
5. ✅ 完整 demo 视频
6. ✅ README 和架构说明

### P1（时间允许才做）
1. 失败重试 UI
2. Batch payout
3. Policy 模板
4. 更好的审批 UX

### P2（可以不做）
1. 多组织支持
2. 复杂 indexer
3. Webhook
4. 二次审批

---

## 风险缓解

### 风险1：Typed approval 钱包不支持
**缓解**：
- 用 signMessage + 前端展示人类可读卡片
- 不依赖钱包原生 typed rendering
- Pitch 中说明"这是未来方向，我们提供了参考实现"

### 风险2：AI 部分喧宾夺主
**缓解**：
- AI 只占 demo 的 20% 时间
- 强调 "AI assists, humans approve"
- 先演示手动创建，再演示 AI 辅助

### 风险3：Demo 不稳定
**缓解**：
- 提前 2 天完成集成
- 准备 fallback demo 数据
- 录制视频而非 live demo
- 关键流程写自动化测试

### 风险4：Relayer 失败
**缓解**：
- 使用成熟 RPC provider（Helius/Quicknode）
- 简单重试逻辑（3次，指数退避）
- Demo 用 devnet，控制变量

### 风险5：时间不够
**缓解**：
- 每天结束评估进度
- 如果落后，立即砍 P1 功能
- 保证 P0 完整性优先于功能广度
- 最后 2 天不加新功能

---

## 差异化保证

### 1. 架构上突出"操作层"
- README 第一句："PolicyPay is not a payment app, it's a payment operations layer"
- 架构图显示：App 层 → PolicyPay → Solana
- Demo 中展示如何被其他系统调用

### 2. 展示 Solana 特有优势
必须在 demo 中体现：
- ✅ Gasless execution（对比：以太坊用户必须有 ETH）
- ✅ Sub-cent 费用（显示实际费用）
- ✅ 快速确认（显示时间戳）
- ✅ Memo/reference 对账（导出对账记录）

### 3. 技术深度展示
在提交材料中包含：
- ✅ Program 源码（Anchor）
- ✅ PDA 设计说明
- ✅ 状态机图
- ✅ 安全考虑（防重放、防重复执行）

### 4. 商业化路径清晰
在 pitch 中说明：
- 目标客户：crypto-native SMB、protocol ops、agent builders
- 收费模式：relayer usage fee + API fee
- 与现有项目的差异（不是 CargoBill 的竞品，是他们的基础设施）

---

## Demo 视频脚本（3-4分钟）

### 开头 20 秒
"Stablecoin payments work on Solana. Stablecoin operations still do not. Agentic finance makes this harder, not easier."

### 第 1 分钟：AI 生成
- 打开 Dashboard
- 输入自然语言："支付 100 USDC 给 3 个 freelancer"
- AI 生成 3 个 intent
- 显示 "AI 建议" 标签

### 第 2 分钟：人类审批
- CFO 打开审批页面
- 看到人类可读的卡片（recipient、amount、memo）
- 点击 approve
- 钱包签名

### 第 3 分钟：Gasless 执行
- Relayer 自动检测
- Sponsor gas 并执行
- Dashboard 显示 confirmed
- 显示 tx hash 和 memo

### 结尾 20 秒
"PolicyPay is the control plane for stablecoin operations and agentic payments on Solana."

---

## 成功标准

Demo 被认为成功的标志：

1. ✅ **30秒理解测试**：陌生人看 README 能在 30 秒内理解这不是支付 app
2. ✅ **完整闭环**：能从 AI 生成到执行完成走完全程
3. ✅ **稳定性**：录制 demo 时一次通过
4. ✅ **技术深度**：评委能看到 Anchor 代码、PDA 设计、状态机
5. ✅ **差异化清晰**：能用一句话说明和 CargoBill/钱包的区别

---

## 关键文件清单

实施时需要创建的核心文件：

### 链上程序
- `programs/policy-pay/src/lib.rs` - Anchor program 入口
- `programs/policy-pay/src/state.rs` - PolicyAccount, PaymentIntent
- `programs/policy-pay/src/instructions/execute_intent.rs` - 核心执行逻辑

### Relayer
- `relayer/src/executor.ts` - Gasless 执行逻辑（关键差异化）
- `relayer/src/monitor.ts` - 监听 approved intents
- `relayer/src/db.ts` - SQLite 状态管理

### Dashboard
- `app/src/components/ApprovalCard.tsx` - 人类可读审批 UX（关键 demo）
- `app/src/lib/solana.ts` - Program 交互层
- `app/src/lib/ai.ts` - AI draft 生成

---

## 时间分配

```
Day 1-3:  Anchor Program (25%)
Day 4-5:  Relayer (17%)
Day 6-8:  Dashboard (25%)
Day 9:    AI Assist (8%)
Day 10-12: 集成+Demo (25%)
```

这个分配确保核心技术有足够时间，同时保证 demo 完整性。

---

## 下一步行动

1. ✅ 测试anchor项目能否正常运行部署测试等操作
2. ✅ 定义 PolicyAccount 和 PaymentIntent 结构
3. ✅ 实现 create_policy 和 create_intent 指令
4. ✅ 部署到 devnet 并测试
5. ✅ 开始 Relayer 开发

**立即开始**：在当前已经初始化的 Anchor 项目中继续开发.
