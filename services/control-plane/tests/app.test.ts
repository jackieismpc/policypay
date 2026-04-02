import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { AuditLogStore } from "../src/audit-log-store";
import { createApp } from "../src/app";
import type { ControlPlaneConfig } from "../src/config";

const createTestConfig = (auditLogPath: string): ControlPlaneConfig => ({
  rpcUrl: "http://127.0.0.1:8899",
  walletPath: path.join(process.cwd(), "wallets/localnet.json"),
  idlPath: path.join(process.cwd(), "target/idl/policy_pay.json"),
  auditLogPath,
  sqlitePath: path.join(path.dirname(auditLogPath), "policypay.sqlite"),
  storageDriver: "json",
  port: 0,
});

const createMockClient = (options?: {
  failCreateIntentIds?: number[];
  failApproveIntentIds?: number[];
}) => {
  const failCreate = new Set(options?.failCreateIntentIds ?? []);
  const failApprove = new Set(options?.failApproveIntentIds ?? []);

  const createdIntentIds: number[] = [];
  const approvedIntentIds: number[] = [];

  return {
    createdIntentIds,
    approvedIntentIds,
    client: {
      program: {
        programId: {
          toBase58: () => "mock-program-id",
        },
      },
      async fetchPolicy(mint: string) {
        return { mint };
      },
      async fetchIntent(policy: string, intentId: number | string) {
        return { policy, intentId };
      },
      async createIntent(input: {
        intentId: number;
        policy: string;
        recipient: string;
        amount: number;
        memo: string;
        reference: string;
      }) {
        if (failCreate.has(input.intentId)) {
          throw new Error(`create-intent-failed-${input.intentId}`);
        }

        createdIntentIds.push(input.intentId);
        return {
          signature: `sig-create-${input.intentId}`,
          paymentIntent: `intent-${input.intentId}`,
        };
      },
      async approveIntent(input: {
        intentId: number;
        policy: string;
        approvalDigest: number[];
      }) {
        if (failApprove.has(input.intentId)) {
          throw new Error(`approve-intent-failed-${input.intentId}`);
        }

        approvedIntentIds.push(input.intentId);
        return {
          signature: `sig-approve-${input.intentId}`,
          paymentIntent: `intent-${input.intentId}`,
        };
      },
      async cancelIntent(input: { intentId: number; policy: string }) {
        return {
          signature: `sig-cancel-${input.intentId}`,
          paymentIntent: `intent-${input.intentId}`,
        };
      },
      async retryIntent(input: { intentId: number; policy: string }) {
        return {
          signature: `sig-retry-${input.intentId}`,
          paymentIntent: `intent-${input.intentId}`,
        };
      },
    },
  };
};

const withServer = async (
  app: ReturnType<typeof createApp>,
  run: (baseUrl: string) => Promise<void>
) => {
  const server = app.listen(0);
  const address = server.address();

  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

test("health route returns ok and program id", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-control-plane-")
  );
  const auditLogPath = path.join(tempDir, "audit-log.json");
  const { client } = createMockClient();

  const app = createApp(createTestConfig(auditLogPath), {
    client: client as any,
    auditLogStore: new AuditLogStore(auditLogPath),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const json = (await response.json()) as { ok: boolean; programId: string };

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.programId, "mock-program-id");
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("batch create endpoint aborts on first error in abort mode", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-pay-batch-"));
  const auditLogPath = path.join(tempDir, "audit-log.json");
  const { client, createdIntentIds } = createMockClient({
    failCreateIntentIds: [2],
  });

  const app = createApp(createTestConfig(auditLogPath), {
    client: client as any,
    auditLogStore: new AuditLogStore(auditLogPath),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/intents/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        mode: "abort-on-error",
        items: [
          {
            intentId: 1,
            recipient: "recipient-1",
            amount: 10,
            memo: "invoice-1",
            reference: "ref-1",
          },
          {
            intentId: 2,
            recipient: "recipient-2",
            amount: 20,
            memo: "invoice-2",
            reference: "ref-2",
          },
          {
            intentId: 3,
            recipient: "recipient-3",
            amount: 30,
            memo: "invoice-3",
            reference: "ref-3",
          },
        ],
      }),
    });

    const json = (await response.json()) as {
      summary: {
        total: number;
        processed: number;
        succeeded: number;
        failed: number;
      };
      results: Array<{ intentId: number; status: string }>;
    };

    assert.equal(response.status, 207);
    assert.equal(json.summary.total, 3);
    assert.equal(json.summary.processed, 2);
    assert.equal(json.summary.succeeded, 1);
    assert.equal(json.summary.failed, 1);
    assert.deepEqual(createdIntentIds, [1]);
    assert.deepEqual(
      json.results.map((item) => item.intentId),
      [1, 2]
    );
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("batch approve endpoint continues on error in continue mode", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-batch-approve-")
  );
  const auditLogPath = path.join(tempDir, "audit-log.json");
  const { client, approvedIntentIds } = createMockClient({
    failApproveIntentIds: [22],
  });

  const app = createApp(createTestConfig(auditLogPath), {
    client: client as any,
    auditLogStore: new AuditLogStore(auditLogPath),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/intents/batch/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        mode: "continue-on-error",
        intentIds: [21, 22, 23],
      }),
    });

    const json = (await response.json()) as {
      summary: {
        total: number;
        processed: number;
        succeeded: number;
        failed: number;
      };
      results: Array<{ intentId: number; status: string }>;
    };

    assert.equal(response.status, 207);
    assert.equal(json.summary.total, 3);
    assert.equal(json.summary.processed, 3);
    assert.equal(json.summary.succeeded, 2);
    assert.equal(json.summary.failed, 1);
    assert.deepEqual(approvedIntentIds, [21, 23]);
    assert.deepEqual(
      json.results.map((item) => item.intentId),
      [21, 22, 23]
    );
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
