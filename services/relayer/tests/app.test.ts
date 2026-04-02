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
  const storePath = path.join(tempDir, "records.json");
  const previousStorePath = process.env.RELAYER_STORE_PATH;

  process.env.RELAYER_STORE_PATH = storePath;

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

  if (previousStorePath === undefined) {
    delete process.env.RELAYER_STORE_PATH;
  } else {
    process.env.RELAYER_STORE_PATH = previousStorePath;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});
