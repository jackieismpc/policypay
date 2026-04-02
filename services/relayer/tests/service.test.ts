import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { RelayerService } from "../src/service";
import { RelayerStore } from "../src/store";

test("relayer service records failed and confirmed executions", async () => {
  const filePath = path.join(
    os.tmpdir(),
    `policy-pay-relayer-${Date.now()}.json`
  );
  const service = new RelayerService(new RelayerStore(filePath));

  const failed = await service.process({
    policy: "policy-1",
    intentId: 1,
    paymentIntent: "intent-pda-1",
    shouldFail: true,
    failureReason: "rpc timeout",
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.failureReason, "rpc timeout");

  const submitted = await service.process({
    policy: "policy-1",
    intentId: 2,
    paymentIntent: "intent-pda-2",
  });

  assert.equal(submitted.status, "submitted");
  assert.equal(Boolean(submitted.signature), true);

  const confirmed = await service.confirm(2);
  assert.equal(confirmed.status, "confirmed");

  fs.rmSync(filePath, { force: true });
});

test("relayer service processes batch with continue-on-error mode", async () => {
  const filePath = path.join(
    os.tmpdir(),
    `policy-pay-relayer-batch-${Date.now()}.json`
  );
  const service = new RelayerService(new RelayerStore(filePath));

  const result = await service.processBatch(
    [
      {
        policy: "policy-1",
        intentId: 10,
        paymentIntent: "intent-pda-10",
      },
      {
        policy: "policy-1",
        intentId: 11,
        paymentIntent: "intent-pda-11",
        shouldFail: true,
        failureReason: "simulated-failure",
      },
      {
        policy: "policy-1",
        intentId: 12,
        paymentIntent: "intent-pda-12",
      },
    ],
    "continue-on-error"
  );

  assert.equal(result.total, 3);
  assert.equal(result.processed, 3);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);

  const records = service.list();
  assert.equal(records.length, 3);
  assert.equal(records[0].intentId, 12);
  assert.equal(records[1].intentId, 11);
  assert.equal(records[2].intentId, 10);

  fs.rmSync(filePath, { force: true });
});
