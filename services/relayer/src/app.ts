import express from "express";

import { relayerConfig } from "./config";
import {
  type BatchExecutionMode,
  type ExecutionTask,
  RelayerService,
} from "./service";
import { createRelayerStore } from "./store";

const ensureObject = (
  value: unknown,
  message: string
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
};

const ensureString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
};

const ensureIntentId = (value: unknown, field = "intentId") => {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numeric;
};

const parseMode = (value: unknown): BatchExecutionMode => {
  if (value === undefined || value === "abort-on-error") {
    return "abort-on-error";
  }

  if (value === "continue-on-error") {
    return "continue-on-error";
  }

  throw new Error("mode must be 'abort-on-error' or 'continue-on-error'");
};

const parseExecutionTask = (value: unknown): ExecutionTask => {
  const body = ensureObject(value, "request body must be an object");
  const shouldFail = body.shouldFail;
  const failureReason = body.failureReason;

  if (shouldFail !== undefined && typeof shouldFail !== "boolean") {
    throw new Error("shouldFail must be a boolean when provided");
  }

  if (failureReason !== undefined && typeof failureReason !== "string") {
    throw new Error("failureReason must be a string when provided");
  }

  return {
    policy: ensureString(body, "policy"),
    intentId: ensureIntentId(body.intentId),
    paymentIntent: ensureString(body, "paymentIntent"),
    shouldFail,
    failureReason,
  };
};

const parseBatchExecutionInput = (value: unknown) => {
  const body = ensureObject(value, "request body must be an object");

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  return {
    mode: parseMode(body.mode),
    items: body.items.map((item, index) =>
      parseExecutionTask(
        ensureObject(item, `items[${index}] must be an object`)
      )
    ),
  };
};

export const createRelayerApp = () => {
  const config = relayerConfig();
  const store = createRelayerStore(config);
  const service = new RelayerService(store);
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, controlPlaneBaseUrl: config.controlPlaneBaseUrl });
  });

  app.get("/executions", (req, res) => {
    const status = req.query.status;

    if (
      status !== undefined &&
      status !== "submitted" &&
      status !== "confirmed" &&
      status !== "failed"
    ) {
      res
        .status(400)
        .json({ error: "status must be submitted, confirmed, or failed" });
      return;
    }

    const items = service
      .list()
      .filter((item) => (status === undefined ? true : item.status === status));

    res.json({ items });
  });

  app.get("/executions/:intentId", (req, res) => {
    let intentId: number;

    try {
      intentId = ensureIntentId(req.params.intentId, "intentId");
    } catch (error) {
      res.status(400).json({ error: String(error) });
      return;
    }

    const item = service.list().find((record) => record.intentId === intentId);

    if (!item) {
      res.status(404).json({ error: `intent ${intentId} not found` });
      return;
    }

    res.json(item);
  });

  app.post("/executions", async (req, res) => {
    try {
      const result = await service.process(parseExecutionTask(req.body));
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/executions/batch", async (req, res) => {
    try {
      const payload = parseBatchExecutionInput(req.body);
      const result = await service.processBatch(payload.items, payload.mode);
      res.status(result.failed === 0 ? 201 : 207).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/executions/:intentId/confirm", async (req, res) => {
    try {
      const result = await service.confirm(
        ensureIntentId(req.params.intentId, "intentId")
      );
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  return app;
};
