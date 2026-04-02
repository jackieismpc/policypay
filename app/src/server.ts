import express from "express";
import { createApp as createControlPlaneApp } from "../../services/control-plane/src/app";
import { defaultConfig as controlPlaneConfig } from "../../services/control-plane/src/config";
import { createIndexerApp } from "../../services/indexer/src/app";
import { createRelayerApp } from "../../services/relayer/src/app";

const app = express();
const port = Number(
  process.env.DASHBOARD_PORT ?? process.env.POLICYPAY_PORT ?? 24040
);

type DashboardCompositionMode = "embedded" | "proxy";

const hasExternalServiceUrls =
  Boolean(process.env.CONTROL_PLANE_BASE_URL) ||
  Boolean(process.env.RELAYER_BASE_URL) ||
  Boolean(process.env.INDEXER_BASE_URL);

const compositionMode: DashboardCompositionMode =
  process.env.DASHBOARD_COMPOSITION_MODE === "embedded" ||
  process.env.DASHBOARD_COMPOSITION_MODE === "proxy"
    ? process.env.DASHBOARD_COMPOSITION_MODE
    : hasExternalServiceUrls
    ? "proxy"
    : "embedded";

const externalControlPlaneBaseUrl =
  process.env.CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:24010";
const externalRelayerBaseUrl =
  process.env.RELAYER_BASE_URL ?? "http://127.0.0.1:24020";
const externalIndexerBaseUrl =
  process.env.INDEXER_BASE_URL ?? "http://127.0.0.1:24030";

const internalControlPlaneMount = "/_internal/control-plane";
const internalRelayerMount = "/_internal/relayer";
const internalIndexerMount = "/_internal/indexer";

const dashboardPage = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PolicyPay Dashboard</title>
    <style>
      :root {
        --bg: #f3f6fb;
        --bg-soft: #dce7f5;
        --text: #12233f;
        --text-muted: #4a607f;
        --card: rgba(255, 255, 255, 0.86);
        --line: #c2d2e6;
        --accent: #0d5eb7;
        --accent-soft: #dbeafe;
        --ok: #137a3b;
        --warn: #9a3412;
        --radius: 14px;
        --shadow: 0 14px 30px rgba(15, 42, 81, 0.1);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 15% 15%, #fefce8 0%, transparent 35%),
          radial-gradient(circle at 85% 10%, #dbeafe 0%, transparent 34%),
          linear-gradient(135deg, var(--bg), var(--bg-soft));
      }

      .layout {
        max-width: 1200px;
        margin: 0 auto;
        padding: 28px 20px 40px;
        display: grid;
        gap: 18px;
      }

      .hero {
        border-radius: var(--radius);
        padding: 20px 22px;
        background: var(--card);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }

      h1 {
        margin: 0;
        font-size: 32px;
        letter-spacing: -0.02em;
      }

      .subtitle {
        margin: 8px 0 0;
        color: var(--text-muted);
      }

      .grid {
        display: grid;
        gap: 16px;
      }

      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
      }

      .grid.three {
        grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
      }

      .card {
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: var(--card);
        box-shadow: var(--shadow);
        padding: 16px;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 20px;
      }

      label {
        display: block;
        margin: 0 0 8px;
        font-size: 13px;
        color: var(--text-muted);
      }

      input,
      textarea,
      button,
      select {
        width: 100%;
        border-radius: 10px;
        border: 1px solid var(--line);
        padding: 10px;
        font: inherit;
      }

      textarea {
        min-height: 118px;
        resize: vertical;
      }

      .row {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      }

      button {
        border: none;
        background: linear-gradient(135deg, #0d5eb7, #2563eb);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }

      button:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(37, 99, 235, 0.25);
      }

      .ghost {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }

      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        color: var(--accent);
        background: var(--accent-soft);
      }

      .pane {
        border-radius: 12px;
        border: 1px solid var(--line);
        background: #f8fbff;
        padding: 12px;
      }

      pre {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .status {
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 13px;
        border: 1px solid var(--line);
        background: #fff;
      }

      .status.ok {
        border-color: #86efac;
        background: #f0fdf4;
        color: var(--ok);
      }

      .status.err {
        border-color: #fdba74;
        background: #fff7ed;
        color: var(--warn);
      }
    </style>
  </head>
  <body>
    <main class="layout">
      <section class="hero">
        <h1>PolicyPay Dashboard</h1>
        <p class="subtitle">单笔与批量 intent 的可交互工作台，聚合 Control Plane、Relayer 与 Indexer。</p>
        <div class="meta">
          <span class="pill">Single + Batch Intent</span>
          <span class="pill">Approval + Retry</span>
          <span class="pill">Audit / Execution / Timeline</span>
        </div>
      </section>

      <section class="grid two">
        <article class="card">
          <h2>创建单笔 Intent</h2>
          <form id="single-form">
            <label>Policy
              <input id="single-policy" required placeholder="policy-pda" />
            </label>
            <div class="row">
              <label>Intent ID
                <input id="single-intent-id" required type="number" min="0" placeholder="101" />
              </label>
              <label>Amount
                <input id="single-amount" required type="number" min="1" placeholder="100" />
              </label>
            </div>
            <label>Recipient
              <input id="single-recipient" required placeholder="recipient pubkey" />
            </label>
            <label>Memo
              <input id="single-memo" placeholder="invoice-101" />
            </label>
            <label>Reference
              <input id="single-reference" placeholder="ref-101" />
            </label>
            <button type="submit">创建 Intent</button>
          </form>
          <div id="single-status" class="status">等待提交</div>
        </article>

        <article class="card">
          <h2>批量创建 Intent</h2>
          <form id="batch-form">
            <label>Policy
              <input id="batch-policy" required placeholder="policy-pda" />
            </label>
            <label>Mode
              <select id="batch-mode">
                <option value="abort-on-error">abort-on-error</option>
                <option value="continue-on-error">continue-on-error</option>
              </select>
            </label>
            <label>Items (JSON Array)
              <textarea id="batch-items" required>[{"intentId":201,"recipient":"recipient-a","amount":100,"memo":"invoice-201","reference":"ref-201"}]</textarea>
            </label>
            <button type="submit">批量创建</button>
          </form>
          <div id="batch-status" class="status">等待提交</div>
        </article>
      </section>

      <section class="grid two">
        <article class="card">
          <h2>批量审批</h2>
          <form id="approve-form">
            <label>Policy
              <input id="approve-policy" required placeholder="policy-pda" />
            </label>
            <label>Intent IDs (逗号分隔)
              <input id="approve-ids" required placeholder="201,202,203" />
            </label>
            <label>Mode
              <select id="approve-mode">
                <option value="abort-on-error">abort-on-error</option>
                <option value="continue-on-error">continue-on-error</option>
              </select>
            </label>
            <button type="submit">批量审批</button>
          </form>
          <div id="approve-status" class="status">等待提交</div>
        </article>

        <article class="card">
          <h2>面板刷新</h2>
          <div class="row">
            <button class="ghost" id="refresh-all" type="button">刷新全部面板</button>
            <button class="ghost" id="refresh-summary" type="button">刷新摘要</button>
          </div>
          <div class="pane" style="margin-top: 10px">
            <pre id="summary-pane">{}</pre>
          </div>
        </article>
      </section>

      <section class="grid three">
        <article class="card">
          <h2>Audit Logs</h2>
          <div class="pane"><pre id="audit-pane">[]</pre></div>
        </article>
        <article class="card">
          <h2>Executions</h2>
          <div class="pane"><pre id="execution-pane">[]</pre></div>
        </article>
        <article class="card">
          <h2>Timeline</h2>
          <div class="pane"><pre id="timeline-pane">[]</pre></div>
        </article>
      </section>
    </main>

    <script>
      const byId = (id) => document.getElementById(id);

      const setStatus = (id, message, kind) => {
        const el = byId(id);
        el.textContent = message;
        el.className = kind ? 'status ' + kind : 'status';
      };

      const asPrettyJson = (value) => JSON.stringify(value, null, 2);

      const requestJson = async (url, options) => {
        const response = await fetch(url, options);
        let body;

        try {
          body = await response.json();
        } catch (_error) {
          body = { error: 'invalid-json-response' };
        }

        if (!response.ok) {
          throw new Error(body.error || response.statusText);
        }

        return body;
      };

      const refreshPanels = async () => {
        const [summary, auditLogs, executions, timeline] = await Promise.all([
          requestJson('/api/summary'),
          requestJson('/api/audit-logs'),
          requestJson('/api/executions'),
          requestJson('/api/timeline'),
        ]);

        byId('summary-pane').textContent = asPrettyJson(summary);
        byId('audit-pane').textContent = asPrettyJson(auditLogs.items || []);
        byId('execution-pane').textContent = asPrettyJson(executions.items || []);
        byId('timeline-pane').textContent = asPrettyJson(timeline.items || []);
      };

      byId('single-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = {
          policy: byId('single-policy').value,
          intentId: Number(byId('single-intent-id').value),
          recipient: byId('single-recipient').value,
          amount: Number(byId('single-amount').value),
          memo: byId('single-memo').value,
          reference: byId('single-reference').value,
        };

        try {
          const response = await requestJson('/api/intents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          setStatus('single-status', '创建成功: ' + asPrettyJson(response), 'ok');
          await refreshPanels();
        } catch (error) {
          setStatus('single-status', String(error), 'err');
        }
      });

      byId('batch-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
          const items = JSON.parse(byId('batch-items').value);
          const payload = {
            policy: byId('batch-policy').value,
            mode: byId('batch-mode').value,
            items,
          };

          const response = await requestJson('/api/intents/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          setStatus('batch-status', '批量创建完成: ' + asPrettyJson(response.summary), 'ok');
          await refreshPanels();
        } catch (error) {
          setStatus('batch-status', String(error), 'err');
        }
      });

      byId('approve-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
          const intentIds = byId('approve-ids').value
            .split(',')
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isSafeInteger(item) && item >= 0);

          const payload = {
            policy: byId('approve-policy').value,
            mode: byId('approve-mode').value,
            intentIds,
          };

          const response = await requestJson('/api/intents/batch/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          setStatus('approve-status', '批量审批完成: ' + asPrettyJson(response.summary), 'ok');
          await refreshPanels();
        } catch (error) {
          setStatus('approve-status', String(error), 'err');
        }
      });

      byId('refresh-all').addEventListener('click', async () => {
        try {
          await refreshPanels();
        } catch (error) {
          setStatus('approve-status', String(error), 'err');
        }
      });

      byId('refresh-summary').addEventListener('click', async () => {
        try {
          const summary = await requestJson('/api/summary');
          byId('summary-pane').textContent = asPrettyJson(summary);
        } catch (error) {
          setStatus('approve-status', String(error), 'err');
        }
      });

      refreshPanels().catch((error) => {
        setStatus('approve-status', String(error), 'err');
      });
    </script>
  </body>
</html>`;

const proxyJson = async (
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(url, init);

  let body: unknown;
  try {
    body = await response.json();
  } catch (_error) {
    body = { error: "invalid-json-response" };
  }

  return {
    status: response.status,
    body,
  };
};

const fetchSafeItems = async (
  url: string
): Promise<{ ok: boolean; items: unknown[]; error?: string }> => {
  try {
    const response = await proxyJson(url);

    if (response.status >= 400) {
      return {
        ok: false,
        items: [],
        error: String(
          (response.body as { error?: string }).error ?? "request failed"
        ),
      };
    }

    const items = (response.body as { items?: unknown[] }).items;

    return {
      ok: true,
      items: Array.isArray(items) ? items : [],
    };
  } catch (error) {
    return {
      ok: false,
      items: [],
      error: String(error),
    };
  }
};

const respondProxy = async (
  res: express.Response,
  url: string,
  init?: RequestInit
) => {
  try {
    const response = await proxyJson(url, init);
    res.status(response.status).json(response.body);
  } catch (error) {
    res.status(502).json({ error: String(error) });
  }
};

const resolveBaseOrigin = (req: express.Request) => {
  const host = req.get("host");
  return `${req.protocol}://${host ?? `127.0.0.1:${port}`}`;
};

const resolveServiceBaseUrls = (req: express.Request) => {
  if (compositionMode === "embedded") {
    const origin = resolveBaseOrigin(req);

    return {
      controlPlaneBaseUrl: `${origin}${internalControlPlaneMount}`,
      relayerBaseUrl: `${origin}${internalRelayerMount}`,
      indexerBaseUrl: `${origin}${internalIndexerMount}`,
    };
  }

  return {
    controlPlaneBaseUrl: externalControlPlaneBaseUrl,
    relayerBaseUrl: externalRelayerBaseUrl,
    indexerBaseUrl: externalIndexerBaseUrl,
  };
};

app.use(express.json());

if (compositionMode === "embedded") {
  app.use(
    internalControlPlaneMount,
    createControlPlaneApp(controlPlaneConfig())
  );
  app.use(internalRelayerMount, createRelayerApp());
  app.use(internalIndexerMount, createIndexerApp());
}

app.get("/", (_req, res) => {
  res.type("html").send(dashboardPage);
});

app.get("/api/summary", async (req, res) => {
  const { controlPlaneBaseUrl, relayerBaseUrl, indexerBaseUrl } =
    resolveServiceBaseUrls(req);
  const [audit, executions, timeline] = await Promise.all([
    fetchSafeItems(`${controlPlaneBaseUrl}/audit-logs`),
    fetchSafeItems(`${relayerBaseUrl}/executions`),
    fetchSafeItems(`${indexerBaseUrl}/timeline`),
  ]);

  res.json({
    ok: true,
    stage: "dashboard-workbench",
    integration: {
      controlPlane: audit.ok,
      relayer: executions.ok,
      indexer: timeline.ok,
    },
    counts: {
      auditLogs: audit.items.length,
      executions: executions.items.length,
      timeline: timeline.items.length,
    },
    endpoints: {
      controlPlaneBaseUrl,
      relayerBaseUrl,
      indexerBaseUrl,
    },
    errors: {
      controlPlane: audit.error,
      relayer: executions.error,
      indexer: timeline.error,
    },
  });
});

app.get("/api/audit-logs", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/audit-logs`);
});

app.get("/api/executions", async (req, res) => {
  const { relayerBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${relayerBaseUrl}/executions`);
});

app.get("/api/timeline", async (req, res) => {
  const { indexerBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${indexerBaseUrl}/timeline`);
});

app.post("/api/intents", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
});

app.post("/api/intents/batch", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/intents/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
});

app.post("/api/intents/batch/approve", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/intents/batch/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
});

app.listen(port, () => {
  console.log(
    JSON.stringify({
      service: "dashboard",
      port,
      compositionMode,
      externalServices: {
        controlPlaneBaseUrl: externalControlPlaneBaseUrl,
        relayerBaseUrl: externalRelayerBaseUrl,
        indexerBaseUrl: externalIndexerBaseUrl,
      },
    })
  );
});
