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
  const createdDraftIntentIds: number[] = [];
  const submittedDraftIntentIds: number[] = [];
  const createdBatchIds: number[] = [];
  const addedBatchItemIntentIds: number[] = [];
  const submittedBatchIds: number[] = [];
  const approvedBatchIds: number[] = [];
  const canceledBatchIds: number[] = [];

  return {
    createdIntentIds,
    approvedIntentIds,
    createdDraftIntentIds,
    submittedDraftIntentIds,
    createdBatchIds,
    addedBatchItemIntentIds,
    submittedBatchIds,
    approvedBatchIds,
    canceledBatchIds,
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
      async fetchBatch(policy: string, batchId: number | string) {
        return { policy, batchId };
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
      async createDraftIntent(input: {
        intentId: number;
        policy: string;
        recipient: string;
        amount: number;
        memo: string;
        reference: string;
      }) {
        createdDraftIntentIds.push(input.intentId);
        return {
          signature: `sig-create-draft-${input.intentId}`,
          paymentIntent: `intent-${input.intentId}`,
        };
      },
      async submitDraftIntent(input: { intentId: number; policy: string }) {
        submittedDraftIntentIds.push(input.intentId);
        return {
          signature: `sig-submit-draft-${input.intentId}`,
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
      async createBatchIntent(input: {
        policy: string;
        batchId: number;
        mode?: "abort-on-error" | "continue-on-error";
      }) {
        createdBatchIds.push(input.batchId);
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
        addedBatchItemIntentIds.push(input.intentId);
        return {
          signature: `sig-add-batch-item-${input.intentId}`,
          batchIntent: `batch-${input.batchId}`,
        };
      },
      async submitBatchForApproval(input: { policy: string; batchId: number }) {
        submittedBatchIds.push(input.batchId);
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
        approvedBatchIds.push(input.batchId);
        return {
          signature: `sig-approve-batch-${input.batchId}`,
          batchIntent: `batch-${input.batchId}`,
        };
      },
      async cancelBatchIntent(input: { policy: string; batchId: number }) {
        canceledBatchIds.push(input.batchId);
        return {
          signature: `sig-cancel-batch-${input.batchId}`,
          batchIntent: `batch-${input.batchId}`,
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

test("draft intent endpoints create and submit draft onchain", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-draft-onchain-")
  );
  const auditLogPath = path.join(tempDir, "audit-log.json");
  const { client, createdDraftIntentIds, submittedDraftIntentIds } =
    createMockClient();

  const app = createApp(createTestConfig(auditLogPath), {
    client: client as any,
    auditLogStore: new AuditLogStore(auditLogPath),
  });

  await withServer(app, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/intents/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        intentId: 31,
        recipient: "recipient-31",
        amount: 100,
        memo: "invoice-31",
        reference: "ref-31",
      }),
    });
    assert.equal(createResponse.status, 201);
    assert.deepEqual(createdDraftIntentIds, [31]);

    const submitResponse = await fetch(`${baseUrl}/intents/31/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
      }),
    });
    assert.equal(submitResponse.status, 200);
    assert.deepEqual(submittedDraftIntentIds, [31]);
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("onchain batch endpoints drive batch lifecycle", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-batch-onchain-")
  );
  const auditLogPath = path.join(tempDir, "audit-log.json");
  const {
    client,
    createdBatchIds,
    addedBatchItemIntentIds,
    submittedBatchIds,
    approvedBatchIds,
    canceledBatchIds,
  } = createMockClient();

  const app = createApp(createTestConfig(auditLogPath), {
    client: client as any,
    auditLogStore: new AuditLogStore(auditLogPath),
  });

  await withServer(app, async (baseUrl) => {
    const createBatchResponse = await fetch(`${baseUrl}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        batchId: 55,
        mode: "continue-on-error",
      }),
    });
    assert.equal(createBatchResponse.status, 201);
    assert.deepEqual(createdBatchIds, [55]);

    const addItemResponse = await fetch(`${baseUrl}/batches/55/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        intentId: 5501,
        recipient: "recipient-5501",
        amount: 120,
        memo: "invoice-5501",
        reference: "ref-5501",
      }),
    });
    assert.equal(addItemResponse.status, 201);
    assert.deepEqual(addedBatchItemIntentIds, [5501]);

    const submitBatchResponse = await fetch(`${baseUrl}/batches/55/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
      }),
    });
    assert.equal(submitBatchResponse.status, 200);
    assert.deepEqual(submittedBatchIds, [55]);

    const approveBatchResponse = await fetch(`${baseUrl}/batches/55/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
        approvalDigest: Array(32).fill(1),
      }),
    });
    assert.equal(approveBatchResponse.status, 200);
    assert.deepEqual(approvedBatchIds, [55]);

    const cancelBatchResponse = await fetch(`${baseUrl}/batches/55/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: "policy-1",
      }),
    });
    assert.equal(cancelBatchResponse.status, 200);
    assert.deepEqual(canceledBatchIds, [55]);
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
