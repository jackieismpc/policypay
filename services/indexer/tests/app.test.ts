import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { createIndexerApp } from "../src/app";

const withServer = async (
  app: ReturnType<typeof createIndexerApp>,
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

test("indexer app records and queries timeline entries", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-pay-indexer-"));
  const timelinePath = path.join(tempDir, "timeline.json");
  const originalTimelinePath = process.env.INDEXER_TIMELINE_PATH;

  process.env.INDEXER_TIMELINE_PATH = timelinePath;

  const app = createIndexerApp();

  await withServer(app, async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthJson = (await healthResponse.json()) as { ok: boolean };

    assert.equal(healthResponse.status, 200);
    assert.equal(healthJson.ok, true);

    const chainResponse = await fetch(`${baseUrl}/timeline/chain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intentId: 5,
        status: "approved",
        details: { policy: "policy-1" },
      }),
    });
    assert.equal(chainResponse.status, 201);

    const relayerResponse = await fetch(`${baseUrl}/timeline/relayer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intentId: 5,
        status: "submitted",
        details: { signature: "sig-5" },
      }),
    });
    assert.equal(relayerResponse.status, 201);

    const listResponse = await fetch(`${baseUrl}/timeline?intentId=5`);
    const listJson = (await listResponse.json()) as {
      items: Array<{ source: string; intentId: number }>;
    };

    assert.equal(listResponse.status, 200);
    assert.equal(listJson.items.length, 2);
    assert.equal(listJson.items[0].source, "relayer");
    assert.equal(listJson.items[1].source, "chain");

    const filteredResponse = await fetch(
      `${baseUrl}/timeline?intentId=5&source=chain`
    );
    const filteredJson = (await filteredResponse.json()) as {
      items: Array<{ source: string; intentId: number }>;
    };

    assert.equal(filteredResponse.status, 200);
    assert.equal(filteredJson.items.length, 1);
    assert.equal(filteredJson.items[0].source, "chain");
  });

  if (originalTimelinePath === undefined) {
    delete process.env.INDEXER_TIMELINE_PATH;
  } else {
    process.env.INDEXER_TIMELINE_PATH = originalTimelinePath;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});
