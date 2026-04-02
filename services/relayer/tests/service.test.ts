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
