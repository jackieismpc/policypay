import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const port = Number(
  process.env.DASHBOARD_PORT ?? process.env.POLICYPAY_PORT ?? 24040
);
const rustApiBaseUrl = (
  process.env.POLICYPAY_API_RS_BASE_URL ?? "http://127.0.0.1:24100"
).replace(/\/+$/, "");

const dashboardPage = fs.readFileSync(
  path.resolve(__dirname, "../static/dashboard.html"),
  "utf8"
);

type ForwardableMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const collectForwardHeaders = (
  req: express.Request
): Record<string, string> => {
  const result: Record<string, string> = {};
  const headerKeys = [
    "content-type",
    "authorization",
    "x-api-key",
    "idempotency-key",
  ];

  for (const key of headerKeys) {
    const value = req.header(key);
    if (value) {
      result[key] = value;
    }
  }

  return result;
};

const readResponseBody = async (response: any): Promise<unknown> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  return text.length > 0 ? { message: text } : {};
};

const forwardRequest = async (
  req: express.Request,
  res: express.Response,
  targetUrl: string
) => {
  try {
    const method = req.method as ForwardableMethod;
    const headers = collectForwardHeaders(req);
    const init: any = { method, headers };

    if (method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(req.body ?? {});
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
    }

    const response = await fetch(targetUrl, init);
    const body = await readResponseBody(response);
    res.status(response.status).json(body);
  } catch (error) {
    res.status(502).json({
      error: "rust-api-unreachable",
      detail: String(error),
      target: targetUrl,
    });
  }
};

app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(dashboardPage);
});

app.get("/health", async (req, res) => {
  await forwardRequest(req, res, `${rustApiBaseUrl}/health`);
});

app.get("/openapi.json", async (req, res) => {
  await forwardRequest(req, res, `${rustApiBaseUrl}/openapi.json`);
});

app.use("/api/v1", async (req, res) => {
  const suffix = req.originalUrl.startsWith("/api/v1")
    ? req.originalUrl.slice("/api/v1".length)
    : req.originalUrl;
  const targetUrl = `${rustApiBaseUrl}/api/v1${suffix}`;
  await forwardRequest(req, res, targetUrl);
});

app.listen(port, () => {
  console.log(
    JSON.stringify({
      service: "dashboard",
      port,
      mode: "rust-api-proxy",
      rustApiBaseUrl,
    })
  );
});
