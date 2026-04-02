import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../../services/control-plane/src/app";
import type { ControlPlaneConfig } from "../../services/control-plane/src/config";
import { createIndexerApp } from "../../services/indexer/src/app";
import { createRelayerApp } from "../../services/relayer/src/app";

type RunningServer = {
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
};

const startServer = async (app: Parameters<typeof createServer>[0]) =>
  await new Promise<RunningServer>((resolve, reject) => {
    const server = createServer(app);

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to resolve server address"));
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

const allocatePort = async () =>
  await new Promise<number>((resolve, reject) => {
    const probe = createServer();

    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate port"));
        return;
      }

      const { port } = address;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const waitForUrl = async (url: string, timeoutMs = 10000) => {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // keep polling until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`timeout waiting for ${url}`);
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

const createMockControlPlaneClient = () => {
  const intents = new Map<number, Record<string, unknown>>();
  const batches = new Map<number, Record<string, unknown>>();

  return {
    program: {
      programId: {
        toBase58: () => "policy-pay-mock-program",
      },
    },
    async fetchPolicy(mint: string) {
      return {
        mint,
        authority: "policy-authority",
      };
    },
    async fetchIntent(policy: string, intentId: string | number) {
      const numericIntentId = Number(intentId);
      const item = intents.get(numericIntentId);

      if (!item) {
        throw new Error(
          `intent ${numericIntentId} not found for policy ${policy}`
        );
      }

      return item;
    },
    async fetchBatch(policy: string, batchId: string | number) {
      const numericBatchId = Number(batchId);
      const item = batches.get(numericBatchId);

      if (!item) {
        throw new Error(
          `batch ${numericBatchId} not found for policy ${policy}`
        );
      }

      return item;
    },
    async createIntent(input: {
      policy: string;
      intentId: number;
      recipient: string;
      amount: number;
      memo: string;
      reference: string;
    }) {
      const paymentIntent = `intent-${input.intentId}`;
      const signature = `sig-create-${input.intentId}`;
      intents.set(input.intentId, {
        ...input,
        paymentIntent,
        status: "pending_approval",
      });

      return {
        signature,
        paymentIntent,
      };
    },
    async createDraftIntent(input: {
      policy: string;
      intentId: number;
      recipient: string;
      amount: number;
      memo: string;
      reference: string;
    }) {
      const paymentIntent = `intent-${input.intentId}`;
      intents.set(input.intentId, {
        ...input,
        paymentIntent,
        status: "draft",
      });

      return {
        signature: `sig-create-draft-${input.intentId}`,
        paymentIntent,
      };
    },
    async submitDraftIntent(input: { policy: string; intentId: number }) {
      const current = intents.get(input.intentId);
      if (!current) {
        throw new Error(`intent ${input.intentId} not found`);
      }

      intents.set(input.intentId, {
        ...current,
        status: "pending_approval",
      });

      return {
        signature: `sig-submit-draft-${input.intentId}`,
        paymentIntent: `intent-${input.intentId}`,
      };
    },
    async approveIntent(input: {
      policy: string;
      intentId: number;
      approvalDigest: number[];
    }) {
      const current = intents.get(input.intentId);
      if (!current) {
        throw new Error(`intent ${input.intentId} not found`);
      }

      intents.set(input.intentId, {
        ...current,
        approvalDigest: input.approvalDigest,
        status: "approved",
      });

      return {
        signature: `sig-approve-${input.intentId}`,
        paymentIntent: `intent-${input.intentId}`,
      };
    },
    async cancelIntent(input: { policy: string; intentId: number }) {
      const current = intents.get(input.intentId);
      if (!current) {
        throw new Error(`intent ${input.intentId} not found`);
      }

      intents.set(input.intentId, {
        ...current,
        status: "cancelled",
      });

      return {
        signature: `sig-cancel-${input.intentId}`,
        paymentIntent: `intent-${input.intentId}`,
      };
    },
    async retryIntent(input: { policy: string; intentId: number }) {
      const current = intents.get(input.intentId);
      if (!current) {
        throw new Error(`intent ${input.intentId} not found`);
      }

      intents.set(input.intentId, {
        ...current,
        status: "pending_approval",
      });

      return {
        signature: `sig-retry-${input.intentId}`,
        paymentIntent: `intent-${input.intentId}`,
      };
    },
    async createBatchIntent(input: {
      policy: string;
      batchId: number;
      mode?: "abort-on-error" | "continue-on-error";
    }) {
      batches.set(input.batchId, {
        policy: input.policy,
        batchId: input.batchId,
        mode: input.mode ?? "abort-on-error",
        status: "draft",
        items: [],
      });

      return {
        signature: `sig-create-batch-${input.batchId}`,
        batchIntent: `batch-${input.batchId}`,
      };
    },
    async addBatchItem(input: {
      policy: string;
      batchId: number;
      intentId: number;
      recipient: string;
      amount: number;
      memo: string;
      reference: string;
    }) {
      const current = batches.get(input.batchId);
      if (!current) {
        throw new Error(`batch ${input.batchId} not found`);
      }

      const items = Array.isArray(current.items) ? [...current.items] : [];
      items.push({
        intentId: input.intentId,
        recipient: input.recipient,
        amount: input.amount,
        memo: input.memo,
        reference: input.reference,
      });

      batches.set(input.batchId, {
        ...current,
        items,
      });

      return {
        signature: `sig-add-batch-item-${input.intentId}`,
        batchIntent: `batch-${input.batchId}`,
      };
    },
    async submitBatchForApproval(input: { policy: string; batchId: number }) {
      const current = batches.get(input.batchId);
      if (!current) {
        throw new Error(`batch ${input.batchId} not found`);
      }

      batches.set(input.batchId, {
        ...current,
        status: "pending_approval",
      });

      return {
        signature: `sig-submit-batch-${input.batchId}`,
        batchIntent: `batch-${input.batchId}`,
      };
    },
    async approveBatchIntent(input: {
      policy: string;
      batchId: number;
      approvalDigest: number[];
    }) {
      const current = batches.get(input.batchId);
      if (!current) {
        throw new Error(`batch ${input.batchId} not found`);
      }

      batches.set(input.batchId, {
        ...current,
        status: "approved",
        approvalDigest: input.approvalDigest,
      });

      return {
        signature: `sig-approve-batch-${input.batchId}`,
        batchIntent: `batch-${input.batchId}`,
      };
    },
    async cancelBatchIntent(input: { policy: string; batchId: number }) {
      const current = batches.get(input.batchId);
      if (!current) {
        throw new Error(`batch ${input.batchId} not found`);
      }

      batches.set(input.batchId, {
        ...current,
        status: "cancelled",
      });

      return {
        signature: `sig-cancel-batch-${input.batchId}`,
        batchIntent: `batch-${input.batchId}`,
      };
    },
  };
};

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

  await waitForUrl(`${baseUrl}/api/summary`);

  return {
    child,
    baseUrl,
  };
};

const killChild = async (child: ChildProcess) => {
  if (child.killed) {
    return;
  }

  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
};

const withEnv = (overrides: Record<string, string>) => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
};

test("offchain services work together through dashboard and shared sqlite", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "policypay-e2e-"));
  const sqlitePath = path.join(tempDir, "policypay.sqlite");
  const auditLogPath = path.join(tempDir, "audit-log.json");

  const restoreEnv = withEnv({
    POLICYPAY_STORAGE_DRIVER: "sqlite",
    POLICYPAY_SQLITE_PATH: sqlitePath,
    RELAYER_STORAGE_DRIVER: "sqlite",
    RELAYER_SQLITE_PATH: sqlitePath,
    INDEXER_STORAGE_DRIVER: "sqlite",
    INDEXER_SQLITE_PATH: sqlitePath,
  });

  let controlPlane: RunningServer | undefined;
  let relayer: RunningServer | undefined;
  let indexer: RunningServer | undefined;
  let dashboard: { child: ChildProcess; baseUrl: string } | undefined;

  try {
    const controlPlaneConfig: ControlPlaneConfig = {
      rpcUrl: "http://127.0.0.1:8899",
      walletPath: path.join(process.cwd(), "wallets/localnet.json"),
      idlPath: path.join(process.cwd(), "target/idl/policy_pay.json"),
      auditLogPath,
      sqlitePath,
      storageDriver: "sqlite",
      port: 0,
    };

    const controlPlaneApp = createApp(controlPlaneConfig, {
      client: createMockControlPlaneClient(),
    });

    const relayerApp = createRelayerApp();
    const indexerApp = createIndexerApp();

    controlPlane = await startServer(controlPlaneApp);
    relayer = await startServer(relayerApp);
    indexer = await startServer(indexerApp);

    const dashboardPort = await allocatePort();
    dashboard = await startDashboard({
      ...process.env,
      DASHBOARD_PORT: String(dashboardPort),
      CONTROL_PLANE_BASE_URL: controlPlane.baseUrl,
      RELAYER_BASE_URL: relayer.baseUrl,
      INDEXER_BASE_URL: indexer.baseUrl,
    });

    const batchCreate = await postJson(
      `${dashboard.baseUrl}/api/intents/batch`,
      {
        policy: "policy-001",
        mode: "continue-on-error",
        items: [
          {
            intentId: 9101,
            recipient: "recipient-a",
            amount: 120,
            memo: "invoice-9101",
            reference: "ref-9101",
          },
          {
            intentId: 9102,
            recipient: "recipient-b",
            amount: 220,
            memo: "invoice-9102",
            reference: "ref-9102",
          },
        ],
      }
    );
    assert.equal(batchCreate.status, 201);
    assert.equal(
      (batchCreate.body.summary as { succeeded: number }).succeeded,
      2
    );

    const batchApprove = await postJson(
      `${dashboard.baseUrl}/api/intents/batch/approve`,
      {
        policy: "policy-001",
        mode: "abort-on-error",
        intentIds: [9101, 9102],
      }
    );
    assert.equal(batchApprove.status, 200);
    assert.equal(
      (batchApprove.body.summary as { succeeded: number }).succeeded,
      2
    );

    const batchExecution = await postJson(
      `${relayer.baseUrl}/executions/batch`,
      {
        mode: "continue-on-error",
        items: [
          {
            policy: "policy-001",
            intentId: 9101,
            paymentIntent: "intent-9101",
          },
          {
            policy: "policy-001",
            intentId: 9102,
            paymentIntent: "intent-9102",
            shouldFail: true,
            failureReason: "simulated e2e failure",
          },
        ],
      }
    );
    assert.equal(batchExecution.status, 207);

    const confirmExecution = await postJson(
      `${relayer.baseUrl}/executions/9101/confirm`,
      {}
    );
    assert.equal(confirmExecution.status, 200);

    const chainTimeline = await postJson(`${indexer.baseUrl}/timeline/chain`, {
      intentId: 9101,
      status: "approved",
      details: { policy: "policy-001" },
    });
    assert.equal(chainTimeline.status, 201);

    const relayerTimeline = await postJson(
      `${indexer.baseUrl}/timeline/relayer`,
      {
        intentId: 9101,
        status: "confirmed",
        details: { signature: "sig-9101" },
      }
    );
    assert.equal(relayerTimeline.status, 201);

    const summaryResponse = await fetch(`${dashboard.baseUrl}/api/summary`);
    const summary = (await summaryResponse.json()) as {
      integration: {
        controlPlane: boolean;
        relayer: boolean;
        indexer: boolean;
      };
      counts: {
        auditLogs: number;
        executions: number;
        timeline: number;
      };
    };

    assert.equal(summaryResponse.status, 200);
    assert.equal(summary.integration.controlPlane, true);
    assert.equal(summary.integration.relayer, true);
    assert.equal(summary.integration.indexer, true);
    assert.ok(summary.counts.auditLogs >= 2);
    assert.equal(summary.counts.executions, 2);
    assert.equal(summary.counts.timeline, 2);
  } finally {
    if (dashboard) {
      await killChild(dashboard.child);
    }

    if (indexer) {
      await indexer.close();
    }

    if (relayer) {
      await relayer.close();
    }

    if (controlPlane) {
      await controlPlane.close();
    }

    restoreEnv();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
