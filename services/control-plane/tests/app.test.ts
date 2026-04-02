import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { createApp } from "../src/app";
import type { ControlPlaneConfig } from "../src/config";

test("health route returns ok and program id", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "policy-pay-control-plane-")
  );
  const config: ControlPlaneConfig = {
    rpcUrl: "http://127.0.0.1:8899",
    walletPath: path.join(process.cwd(), "wallets/localnet.json"),
    idlPath: path.join(process.cwd(), "target/idl/policy_pay.json"),
    auditLogPath: path.join(tempDir, "audit-log.json"),
    port: 0,
  };

  const app = createApp(config);
  const server = app.listen(0);
  const address = server.address();

  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const json = (await response.json()) as { ok: boolean; programId: string };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.programId.length > 0, true);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
