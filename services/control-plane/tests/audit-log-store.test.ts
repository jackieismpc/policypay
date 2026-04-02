import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { AuditLogStore, SqliteAuditLogStore } from "../src/audit-log-store";
import { buildAuditEntry } from "../src/types";

test("audit log store appends and lists entries", () => {
  const filePath = path.join(
    os.tmpdir(),
    `policy-pay-audit-${Date.now()}.json`
  );
  const store = new AuditLogStore(filePath);

  const requested = buildAuditEntry("create_intent", "requested", {
    intentId: 1,
  });
  const succeeded = buildAuditEntry("create_intent", "succeeded", {
    signature: "abc",
  });

  store.append(requested);
  store.append(succeeded);

  const items = store.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].status, "succeeded");
  assert.equal(items[1].status, "requested");

  fs.rmSync(filePath, { force: true });
});

test("sqlite audit log store appends and lists entries", () => {
  const sqlitePath = path.join(
    os.tmpdir(),
    `policy-pay-audit-${Date.now()}.sqlite`
  );
  const store = new SqliteAuditLogStore(sqlitePath);

  const requested = buildAuditEntry("create_intent", "requested", {
    intentId: 11,
  });
  const failed = buildAuditEntry("create_intent", "failed", {
    error: "simulated failure",
  });

  store.append(requested);
  store.append(failed);

  const items = store.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].status, "failed");
  assert.equal(items[1].status, "requested");

  fs.rmSync(sqlitePath, { force: true });
});
