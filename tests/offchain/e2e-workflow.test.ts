import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import test from "node:test";

type RunningServer = {
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
};

type BatchRecord = {
  policy: string;
  batchId: number;
  mode: string;
  status: string;
  items: Array<{
    intentId: number;
    recipient: string;
    amount: number;
    memo: string;
    reference: string;
  }>;
};

const waitForUrl = async (url: string, timeoutMs = 10000) => {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // keep waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  throw new Error(`timeout waiting for ${url}`);
};

const readJsonBody = async (
  req: IncomingMessage
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
};

const writeJson = (
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown
) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const startMockRustApi = async (): Promise<RunningServer> =>
  await new Promise<RunningServer>((resolve, reject) => {
    const batches = new Map<number, BatchRecord>();
    const auditLogs: Array<Record<string, unknown>> = [];

    const server = createServer(async (req, res) => {
      const method = req.method ?? "GET";
      const rawUrl = req.url ?? "/";
      const url = new URL(rawUrl, "http://127.0.0.1");
      const path = url.pathname;

      try {
        if (method === "GET" && path === "/api/v1/summary") {
          writeJson(res, 200, {
            ok: true,
            stage: "rust-unified-api",
            integration: {
              controlPlane: false,
              rustOnchainEntry: true,
              relayer: true,
              indexer: true,
            },
            counts: {
              auditLogs: auditLogs.length,
              executions: 0,
              timeline: 0,
            },
            runtime: "tokio+axum",
          });
          return;
        }

        if (method === "GET" && path === "/api/v1/audit-logs") {
          writeJson(res, 200, { items: auditLogs });
          return;
        }

        if (method === "GET" && path === "/api/v1/executions") {
          writeJson(res, 200, { items: [] });
          return;
        }

        if (method === "GET" && path === "/api/v1/timeline") {
          writeJson(res, 200, { items: [] });
          return;
        }

        if (method === "POST" && path === "/api/v1/intents") {
          const payload = await readJsonBody(req);
          auditLogs.push({
            action: "create_intent",
            status: "succeeded",
            payload,
          });
          writeJson(res, 201, {
            signature: "sig-create-intent-mock",
            paymentIntent: `intent-${String(payload.intentId ?? "unknown")}`,
          });
          return;
        }

        if (method === "POST" && path === "/api/v1/batches") {
          const payload = await readJsonBody(req);
          const batchId = Number(payload.batchId);
          if (!Number.isSafeInteger(batchId) || batchId < 0) {
            writeJson(res, 400, { error: "invalid batchId" });
            return;
          }

          const record: BatchRecord = {
            policy: String(payload.policy ?? ""),
            batchId,
            mode: String(payload.mode ?? "abort-on-error"),
            status: "draft",
            items: [],
          };
          batches.set(batchId, record);
          auditLogs.push({
            action: "create_batch_intent_onchain",
            status: "succeeded",
            batchId,
          });
          writeJson(res, 201, {
            signature: `sig-create-batch-${batchId}`,
            batchIntent: `batch-${batchId}`,
          });
          return;
        }

        const addItemMatch = path.match(/^\/api\/v1\/batches\/(\d+)\/items$/);
        if (method === "POST" && addItemMatch) {
          const batchId = Number(addItemMatch[1]);
          const current = batches.get(batchId);
          if (!current) {
            writeJson(res, 404, { error: `batch ${batchId} not found` });
            return;
          }

          const payload = await readJsonBody(req);
          current.items.push({
            intentId: Number(payload.intentId ?? 0),
            recipient: String(payload.recipient ?? ""),
            amount: Number(payload.amount ?? 0),
            memo: String(payload.memo ?? ""),
            reference: String(payload.reference ?? ""),
          });
          batches.set(batchId, current);
          writeJson(res, 201, {
            signature: `sig-add-item-${batchId}-${current.items.length}`,
            batchIntent: `batch-${batchId}`,
          });
          return;
        }

        const submitMatch = path.match(/^\/api\/v1\/batches\/(\d+)\/submit$/);
        if (method === "POST" && submitMatch) {
          const batchId = Number(submitMatch[1]);
          const current = batches.get(batchId);
          if (!current) {
            writeJson(res, 404, { error: `batch ${batchId} not found` });
            return;
          }
          current.status = "pending_approval";
          writeJson(res, 200, {
            signature: `sig-submit-batch-${batchId}`,
            batchIntent: `batch-${batchId}`,
          });
          return;
        }

        const approveMatch = path.match(/^\/api\/v1\/batches\/(\d+)\/approve$/);
        if (method === "POST" && approveMatch) {
          const batchId = Number(approveMatch[1]);
          const current = batches.get(batchId);
          if (!current) {
            writeJson(res, 404, { error: `batch ${batchId} not found` });
            return;
          }
          current.status = "approved";
          writeJson(res, 200, {
            signature: `sig-approve-batch-${batchId}`,
            batchIntent: `batch-${batchId}`,
          });
          return;
        }

        const cancelMatch = path.match(/^\/api\/v1\/batches\/(\d+)\/cancel$/);
        if (method === "POST" && cancelMatch) {
          const batchId = Number(cancelMatch[1]);
          const current = batches.get(batchId);
          if (!current) {
            writeJson(res, 404, { error: `batch ${batchId} not found` });
            return;
          }
          current.status = "cancelled";
          writeJson(res, 200, {
            signature: `sig-cancel-batch-${batchId}`,
            batchIntent: `batch-${batchId}`,
          });
          return;
        }

        const batchQueryMatch = path.match(
          /^\/api\/v1\/policies\/([^/]+)\/batches\/(\d+)$/
        );
        if (method === "GET" && batchQueryMatch) {
          const policy = decodeURIComponent(batchQueryMatch[1]);
          const batchId = Number(batchQueryMatch[2]);
          const current = batches.get(batchId);
          if (!current || current.policy !== policy) {
            writeJson(res, 404, {
              error: `batch ${batchId} not found for policy ${policy}`,
            });
            return;
          }
          writeJson(res, 200, {
            policy,
            batchId,
            mode: current.mode,
            status: current.status,
            totalItems: current.items.length,
            items: current.items,
          });
          return;
        }

        if (method === "GET" && path === "/health") {
          writeJson(res, 200, { ok: true });
          return;
        }

        if (method === "GET" && path === "/openapi.json") {
          writeJson(res, 200, { openapi: "3.0.3" });
          return;
        }

        writeJson(res, 404, { error: "not found" });
      } catch (error) {
        writeJson(res, 500, { error: String(error) });
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to start mock rust api"));
        return;
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });

const startDashboard = async (
  env: NodeJS.ProcessEnv
): Promise<{ child: ChildProcess; baseUrl: string }> => {
  const child = spawn(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "app/src/server.ts"],
    {
      cwd: process.cwd(),
      env,
      stdio: "ignore",
    }
  );

  const port = Number(env.DASHBOARD_PORT);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForUrl(`${baseUrl}/api/v1/summary`);
  return { child, baseUrl };
};

const killChild = async (child: ChildProcess) => {
  if (child.killed) {
    return;
  }

  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
};

const postJson = async (url: string, payload: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
};

test("dashboard proxies rust unified api for batch workflow", async () => {
  const rustApi = await startMockRustApi();
  const dashboardPort = 24140;
  const dashboard = await startDashboard({
    ...process.env,
    DASHBOARD_PORT: String(dashboardPort),
    POLICYPAY_API_RS_BASE_URL: rustApi.baseUrl,
  });

  try {
    const createBatch = await postJson(`${dashboard.baseUrl}/api/v1/batches`, {
      policy: "policy-001",
      batchId: 5001,
      mode: "continue-on-error",
    });
    assert.equal(createBatch.status, 201);

    const addItem1 = await postJson(
      `${dashboard.baseUrl}/api/v1/batches/5001/items`,
      {
        policy: "policy-001",
        intentId: 9101,
        recipient: "recipient-a",
        amount: 120,
        memo: "invoice-9101",
        reference: "ref-9101",
      }
    );
    assert.equal(addItem1.status, 201);

    const addItem2 = await postJson(
      `${dashboard.baseUrl}/api/v1/batches/5001/items`,
      {
        policy: "policy-001",
        intentId: 9102,
        recipient: "recipient-b",
        amount: 220,
        memo: "invoice-9102",
        reference: "ref-9102",
      }
    );
    assert.equal(addItem2.status, 201);

    const submit = await postJson(
      `${dashboard.baseUrl}/api/v1/batches/5001/submit`,
      { policy: "policy-001" }
    );
    assert.equal(submit.status, 200);

    const approve = await postJson(
      `${dashboard.baseUrl}/api/v1/batches/5001/approve`,
      { policy: "policy-001" }
    );
    assert.equal(approve.status, 200);

    const queryResponse = await fetch(
      `${dashboard.baseUrl}/api/v1/policies/policy-001/batches/5001`
    );
    const queried = (await queryResponse.json()) as {
      status: string;
      totalItems: number;
    };
    assert.equal(queryResponse.status, 200);
    assert.equal(queried.status, "approved");
    assert.equal(queried.totalItems, 2);

    const summaryResponse = await fetch(`${dashboard.baseUrl}/api/v1/summary`);
    const summary = (await summaryResponse.json()) as {
      ok: boolean;
      stage: string;
    };
    assert.equal(summaryResponse.status, 200);
    assert.equal(summary.ok, true);
    assert.equal(summary.stage, "rust-unified-api");
  } finally {
    await killChild(dashboard.child);
    await rustApi.close();
  }
});
