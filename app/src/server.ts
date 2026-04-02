import express from "express";

const app = express();
const port = Number(process.env.DASHBOARD_PORT ?? 4030);

const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PolicyPay Dashboard</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; background: #0b1020; color: #e5e7eb; }
      .container { max-width: 1100px; margin: 0 auto; padding: 32px; }
      h1, h2 { margin: 0 0 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; }
      .muted { color: #9ca3af; }
      .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #1f2937; margin-right: 8px; }
      ul { padding-left: 18px; }
      code { background: #0f172a; padding: 2px 6px; border-radius: 6px; }
      .cta { margin-top: 16px; padding: 12px 16px; border-radius: 10px; border: 1px solid #374151; background: #2563eb; color: white; display: inline-block; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>PolicyPay Dashboard MVP</h1>
      <p class="muted">当前版本先完成单笔 intent 的最小可演示前端入口，消费控制面、执行层和时间线索引。</p>
      <div class="grid">
        <section class="card">
          <h2>当前可用能力</h2>
          <div>
            <span class="pill">Create Intent</span>
            <span class="pill">Approve / Cancel</span>
            <span class="pill">Retry</span>
            <span class="pill">Timeline</span>
          </div>
          <ul>
            <li>通过 Control Plane 查询单个 <code>policy</code> 和 <code>intent</code></li>
            <li>通过 Relayer 记录执行、失败和确认</li>
            <li>通过 Indexer 维护链上/执行时间线</li>
          </ul>
        </section>
        <section class="card">
          <h2>下一步 UI 目标</h2>
          <ul>
            <li>表单化创建单笔 intent</li>
            <li>可读审批字段展示</li>
            <li>失败后重试入口</li>
            <li>执行签名与状态时间线展示</li>
          </ul>
          <a class="cta" href="/api/summary">查看 MVP 摘要 JSON</a>
        </section>
      </div>
    </div>
  </body>
</html>`;

app.get("/", (_req, res) => {
  res.type("html").send(page);
});

app.get("/api/summary", (_req, res) => {
  res.json({
    ok: true,
    stage: "dashboard-mvp",
    features: [
      "single-intent-overview",
      "control-plane-integration-ready",
      "relayer-indexer-integration-ready",
    ],
  });
});

app.listen(port, () => {
  console.log(JSON.stringify({ service: "dashboard", port }));
});
