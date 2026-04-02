import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { IndexerService } from "../src/service";
import { TimelineStore } from "../src/timeline-store";

test("indexer service appends chain and relayer timeline entries", () => {
  const filePath = path.join(
    os.tmpdir(),
    `policy-pay-indexer-${Date.now()}.json`
  );
  const service = new IndexerService(new TimelineStore(filePath));

  service.recordChainStatus(1, "approved", { policy: "policy-1" });
  service.recordRelayerStatus(1, "submitted", { signature: "sig-1" });

  const items = service.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "relayer");
  assert.equal(items[1].source, "chain");

  fs.rmSync(filePath, { force: true });
});
