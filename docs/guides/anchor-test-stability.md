# Anchor Test Stability Guide

## 背景

在当前开发环境中，直接执行 `anchor test` 偶发失败，常见错误：

- `Unable to get latest blockhash. Test validator does not look started.`
- `Error: Your configured rpc port: 8899 is already in use`

## 根因分析（基于本仓库复现）

1. `anchor test` 内置的 local validator 启动探测窗口存在不稳定性。
- 现象：`.anchor/test-ledger/test-ledger-log.txt` 已显示 slot 持续推进，但 `anchor test` 仍在 `latest blockhash` 探测阶段失败。
- 结论：这不是单纯的“validator 完全没启动”，而是启动阶段探测与 RPC 可用性之间存在竞态。

2. 失败后可能残留 validator 进程，导致后续端口冲突。
- 现象：后续执行出现 `rpc port ... already in use`。
- 结论：如果没有先清理残留进程，重复执行会放大失败概率。

## 稳定执行顺序（推荐）

使用仓库脚本：

```bash
yarn run test:anchor:safe
```

该脚本（`scripts/anchor-test-safe.sh`）按固定顺序执行：

1. 清理测试端口上残留的 `solana-test-validator`。
2. 启动独立 validator（默认 `28999/29900`，避免与 `8899` 冲突）。
3. 连续探测 `slot + getHealth + getLatestBlockhash`，直到稳定可用。
4. `anchor build`。
5. `solana airdrop` 给测试钱包。
6. `solana program deploy`。
7. 运行 `yarn run test:anchor:ts`。
8. 退出时自动关闭 validator。

## 环境变量

可按需覆盖：

- `ANCHOR_TEST_RPC_PORT`（默认 `28999`）
- `ANCHOR_TEST_FAUCET_PORT`（默认 `29900`）
- `ANCHOR_TEST_LEDGER_DIR`
- `ANCHOR_TEST_WALLET`
- `ANCHOR_TEST_PROGRAM_SO`
- `ANCHOR_TEST_PROGRAM_KEYPAIR`

## 故障排查

1. 端口被非 validator 进程占用
- 先检查并释放端口：`lsof -nP -iTCP:<port> -sTCP:LISTEN`

2. 钱包文件不存在
- 先生成：

```bash
solana-keygen new --no-bip39-passphrase -s -o ./wallets/localnet.json
```

3. 部署前未 build
- 脚本内已执行 `anchor build`，若手动流程请先执行 `anchor build`。
