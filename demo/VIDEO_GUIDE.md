# Demo Video Guide

## 录制目标

交付一份可复现的产品演示视频，覆盖：

- Dashboard 交互
- API 调用链路
- 测试通过结果
- 存储与端口配置说明

## 建议输出路径（本地）

- `demo/videos/policypay-demo-YYYYMMDD.mp4`

说明：`demo/videos/` 目录建议只保留在本地，不推送到远端仓库。

## 建议录制步骤

1. 按 `demo/DEMO_SCRIPT.md` 顺序演示。
2. 录制时先展示默认单端口启动日志和端口（`24040`）。
3. 如需说明兼容部署，可补充展示 proxy 模式下的独立服务端口（`24010/24020/24030`）。
4. 运行 `demo/live_demo.sh` 展示离链服务可复现调用。
5. 补充演示一次链上 `create_draft_intent -> submit_draft_intent` 与 `BatchIntent` 审批流程。
6. 最后展示 `README.md` + `docs/guides/quickstart.md` + `examples/README.md`。

## 交付检查项

- 视频能看到 Dashboard 页面。
- 视频中包含至少一次批量执行与失败过滤查询。
- 视频中明确提到默认 SQLite 存储与可切换 JSON。
- 视频中展示测试命令或测试结果。
