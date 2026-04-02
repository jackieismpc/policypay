import express from "express";
import fs from "fs";
import path from "path";

import { createApp as createControlPlaneApp } from "../../services/control-plane/src/app";
import { defaultConfig as controlPlaneConfig } from "../../services/control-plane/src/config";
import { createIndexerApp } from "../../services/indexer/src/app";
import { createRelayerApp } from "../../services/relayer/src/app";

const app = express();
const port = Number(
  process.env.DASHBOARD_PORT ?? process.env.POLICYPAY_PORT ?? 24040
);

type DashboardCompositionMode = "embedded" | "proxy" | "rust-proxy";

const explicitCompositionMode = process.env.DASHBOARD_COMPOSITION_MODE;
const hasExternalServiceUrls =
  Boolean(process.env.CONTROL_PLANE_BASE_URL) ||
  Boolean(process.env.RELAYER_BASE_URL) ||
  Boolean(process.env.INDEXER_BASE_URL);
const hasRustApiUrl = Boolean(process.env.POLICYPAY_API_RS_BASE_URL);

const compositionMode: DashboardCompositionMode =
  explicitCompositionMode === "embedded" ||
  explicitCompositionMode === "proxy" ||
  explicitCompositionMode === "rust-proxy"
    ? explicitCompositionMode
    : hasRustApiUrl
    ? "rust-proxy"
    : hasExternalServiceUrls
    ? "proxy"
    : "embedded";

const externalControlPlaneBaseUrl =
  process.env.CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:24010";
const externalRelayerBaseUrl =
  process.env.RELAYER_BASE_URL ?? "http://127.0.0.1:24020";
const externalIndexerBaseUrl =
  process.env.INDEXER_BASE_URL ?? "http://127.0.0.1:24030";
const rustApiBaseUrl =
  process.env.POLICYPAY_API_RS_BASE_URL ?? "http://127.0.0.1:24100";

const internalControlPlaneMount = "/_internal/control-plane";
const internalRelayerMount = "/_internal/relayer";
const internalIndexerMount = "/_internal/indexer";

const dashboardPage = fs.readFileSync(
  path.resolve(__dirname, "../static/dashboard.html"),
  "utf8"
);

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

  if (compositionMode === "rust-proxy") {
    return {
      controlPlaneBaseUrl: rustApiBaseUrl,
      relayerBaseUrl: rustApiBaseUrl,
      indexerBaseUrl: rustApiBaseUrl,
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

app.post("/api/intents/draft", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/intents/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
});

app.post("/api/intents/:intentId(\\d+)/submit", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/intents/${req.params.intentId}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/intents/:intentId(\\d+)/approve", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/intents/${req.params.intentId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/intents/:intentId(\\d+)/cancel", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/intents/${req.params.intentId}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/intents/:intentId(\\d+)/retry", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/intents/${req.params.intentId}/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
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

app.get("/api/policies/:policy/batches/:batchId", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/policies/${req.params.policy}/batches/${req.params.batchId}`
  );
});

app.post("/api/batches", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(res, `${controlPlaneBaseUrl}/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
});

app.post("/api/batches/:batchId(\\d+)/items", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/batches/${req.params.batchId}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/batches/:batchId(\\d+)/submit", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/batches/${req.params.batchId}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/batches/:batchId(\\d+)/approve", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/batches/${req.params.batchId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
});

app.post("/api/batches/:batchId(\\d+)/cancel", async (req, res) => {
  const { controlPlaneBaseUrl } = resolveServiceBaseUrls(req);
  await respondProxy(
    res,
    `${controlPlaneBaseUrl}/batches/${req.params.batchId}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }
  );
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
      rustApiBaseUrl,
    })
  );
});
