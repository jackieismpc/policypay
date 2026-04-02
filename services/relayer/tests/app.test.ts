import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { createRelayerApp } from "../src/app";

const withServer = async (
  app: ReturnType<typeof createRelayerApp>,
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

test("relayer app supports batch execution and filtering", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-relayer-app-")
  );
  const sqlitePath = path.join(tempDir, "policypay.sqlite");
  const previousSqlitePath = process.env.RELAYER_SQLITE_PATH;
  const previousStorageDriver = process.env.RELAYER_STORAGE_DRIVER;
  const previousGlobalStorageDriver = process.env.POLICYPAY_STORAGE_DRIVER;

  process.env.RELAYER_SQLITE_PATH = sqlitePath;
  process.env.RELAYER_STORAGE_DRIVER = "sqlite";
  delete process.env.POLICYPAY_STORAGE_DRIVER;

  const app = createRelayerApp();

  await withServer(app, async (baseUrl) => {
    const batchResponse = await fetch(`${baseUrl}/executions/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "continue-on-error",
        items: [
          {
            policy: "policy-1",
            intentId: 100,
            paymentIntent: "intent-100",
          },
          {
            policy: "policy-1",
            intentId: 101,
            paymentIntent: "intent-101",
            shouldFail: true,
            failureReason: "simulated-failure",
          },
        ],
      }),
    });

    const batchJson = (await batchResponse.json()) as {
      total: number;
      succeeded: number;
      failed: number;
    };

    assert.equal(batchResponse.status, 207);
    assert.equal(batchJson.total, 2);
    assert.equal(batchJson.succeeded, 1);
    assert.equal(batchJson.failed, 1);

    const failedResponse = await fetch(`${baseUrl}/executions?status=failed`);
    const failedJson = (await failedResponse.json()) as {
      items: Array<{ intentId: number; status: string }>;
    };

    assert.equal(failedResponse.status, 200);
    assert.equal(failedJson.items.length, 1);
    assert.equal(failedJson.items[0].intentId, 101);
    assert.equal(failedJson.items[0].status, "failed");
  });

  if (previousSqlitePath === undefined) {
    delete process.env.RELAYER_SQLITE_PATH;
  } else {
    process.env.RELAYER_SQLITE_PATH = previousSqlitePath;
  }

  if (previousStorageDriver === undefined) {
    delete process.env.RELAYER_STORAGE_DRIVER;
  } else {
    process.env.RELAYER_STORAGE_DRIVER = previousStorageDriver;
  }

  if (previousGlobalStorageDriver === undefined) {
    delete process.env.POLICYPAY_STORAGE_DRIVER;
  } else {
    process.env.POLICYPAY_STORAGE_DRIVER = previousGlobalStorageDriver;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});
