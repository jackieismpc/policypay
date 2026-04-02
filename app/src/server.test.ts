import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { spawn } from "node:child_process";

type MockRustApi = {
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
};

const startMockRustApi = async (): Promise<MockRustApi> =>
  await new Promise<MockRustApi>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = req.url ?? "/";
      res.setHeader("Content-Type", "application/json");

      if (url === "/api/v1/summary") {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            stage: "rust-unified-api",
            counts: {
              auditLogs: 0,
              executions: 0,
              timeline: 0,
            },
          })
        );
        return;
      }

      if (url === "/api/v1/audit-logs") {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      if (url === "/api/v1/executions") {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      if (url === "/api/v1/timeline") {
        res.writeHead(200);
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      if (url === "/health") {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url === "/openapi.json") {
        res.writeHead(200);
        res.end(JSON.stringify({ openapi: "3.0.3" }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "not found" }));
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to start mock rust api"));
        return;
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });

const waitForServer = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const probe = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/summary`);
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
  const mockRustApi = await startMockRustApi();
  const child = spawn(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "app/src/server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        POLICYPAY_API_RS_BASE_URL: mockRustApi.baseUrl,
      },
      stdio: "ignore",
    }
  );

  try {
    await waitForServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/summary`);
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
    assert.equal(json.stage, "rust-unified-api");
    assert.equal(typeof json.counts.auditLogs, "number");
    assert.equal(typeof json.counts.executions, "number");
    assert.equal(typeof json.counts.timeline, "number");
  } finally {
    child.kill();
    await mockRustApi.close();
  }
});

test("dashboard page includes onchain batch workflow section", async () => {
  const port = 4131;
  const mockRustApi = await startMockRustApi();
  const child = spawn(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "app/src/server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        POLICYPAY_API_RS_BASE_URL: mockRustApi.baseUrl,
      },
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
    await mockRustApi.close();
  }
});
