import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";

const waitForServer = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const probe = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/summary`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch (_error) {
        if (Date.now() - startedAt > 5000) {
          reject(new Error("dashboard server did not start in time"));
          return;
        }
      }

      setTimeout(probe, 100);
    };

    void probe();
  });

test("dashboard summary endpoint responds", async () => {
  const port = 4130;
  const child = spawn(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "app/src/server.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DASHBOARD_PORT: String(port) },
      stdio: "ignore",
    }
  );

  try {
    await waitForServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/summary`);
    const json = (await response.json()) as {
      ok: boolean;
      stage: string;
      counts: {
        auditLogs: number;
        executions: number;
        timeline: number;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.stage, "dashboard-workbench");
    assert.equal(typeof json.counts.auditLogs, "number");
    assert.equal(typeof json.counts.executions, "number");
    assert.equal(typeof json.counts.timeline, "number");
  } finally {
    child.kill();
  }
});

test("dashboard page includes onchain batch workflow section", async () => {
  const port = 4131;
  const child = spawn(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "app/src/server.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DASHBOARD_PORT: String(port) },
      stdio: "ignore",
    }
  );

  try {
    await waitForServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /链上 BatchIntent 全流程/);
  } finally {
    child.kill();
  }
});
