import express from "express";

import { type AuditLogStoreLike, createAuditLogStore } from "./audit-log-store";
import type { ControlPlaneConfig } from "./config";
import { defaultConfig } from "./config";
import { PolicyPayClient } from "./policy-pay-client";
import { buildAuditEntry } from "./types";

type CreateIntentInput = {
  policy: string;
  intentId: number;
  recipient: string;
  amount: number;
  memo: string;
  reference: string;
};

type ApproveIntentInput = {
  policy: string;
  intentId: number;
  approvalDigest: number[];
};

type CancelIntentInput = {
  policy: string;
  intentId: number;
};

type RetryIntentInput = {
  policy: string;
  intentId: number;
};

type SubmitDraftIntentInput = {
  policy: string;
  intentId: number;
};

type CreateBatchIntentInput = {
  policy: string;
  batchId: number;
  mode: BatchMode;
};

type AddBatchItemInput = {
  policy: string;
  batchId: number;
  intentId: number;
  recipient: string;
  amount: number;
  memo: string;
  reference: string;
};

type BatchActionInput = {
  policy: string;
  batchId: number;
};

type ApproveBatchIntentInput = {
  policy: string;
  batchId: number;
  approvalDigest: number[];
};

type BatchMode = "abort-on-error" | "continue-on-error";

type BatchResult = {
  intentId: number;
  status: "succeeded" | "failed";
  signature?: string;
  paymentIntent?: string;
  error?: string;
};

type PolicyPayClientLike = Pick<
  PolicyPayClient,
  | "program"
  | "fetchPolicy"
  | "fetchIntent"
  | "fetchBatch"
  | "createIntent"
  | "createDraftIntent"
  | "submitDraftIntent"
  | "approveIntent"
  | "cancelIntent"
  | "retryIntent"
  | "createBatchIntent"
  | "addBatchItem"
  | "submitBatchForApproval"
  | "approveBatchIntent"
  | "cancelBatchIntent"
>;

type AppDependencies = {
  client?: PolicyPayClientLike;
  auditLogStore?: AuditLogStoreLike;
};

const ensureObject = (
  value: unknown,
  message: string
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
};

const ensureString = (
  body: Record<string, unknown>,
  field: string,
  allowEmpty = false
): string => {
  const value = body[field];

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw new Error(`${field} must not be empty`);
  }

  return trimmed;
};

const ensureIntentId = (value: unknown, field = "intentId"): number => {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numeric;
};

const ensureAmount = (value: unknown): number => {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error("amount must be a positive integer");
  }

  return numeric;
};

const parseApprovalDigest = (value: unknown): number[] => {
  if (value === undefined) {
    return Array(32).fill(0);
  }

  if (!Array.isArray(value) || value.length !== 32) {
    throw new Error("approvalDigest must be an array of 32 bytes");
  }

  const bytes = value.map((item) => Number(item));
  const isValidByte = bytes.every(
    (item) => Number.isInteger(item) && item >= 0 && item <= 255
  );

  if (!isValidByte) {
    throw new Error(
      "approvalDigest must contain byte values between 0 and 255"
    );
  }

  return bytes;
};

const parseBatchMode = (value: unknown): BatchMode => {
  if (value === undefined || value === "abort-on-error") {
    return "abort-on-error";
  }

  if (value === "continue-on-error") {
    return "continue-on-error";
  }

  throw new Error("mode must be 'abort-on-error' or 'continue-on-error'");
};

const parseCreateIntentInput = (value: unknown): CreateIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    intentId: ensureIntentId(body.intentId),
    recipient: ensureString(body, "recipient"),
    amount: ensureAmount(body.amount),
    memo: ensureString(body, "memo", true),
    reference: ensureString(body, "reference", true),
  };
};

const parseApproveIntentInput = (
  value: unknown,
  intentIdFromPath?: string
): ApproveIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    intentId:
      intentIdFromPath === undefined
        ? ensureIntentId(body.intentId)
        : ensureIntentId(intentIdFromPath),
    approvalDigest: parseApprovalDigest(body.approvalDigest),
  };
};

const parseCancelInput = (
  value: unknown,
  intentIdFromPath: string
): CancelIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    intentId: ensureIntentId(intentIdFromPath),
  };
};

const parseRetryInput = (
  value: unknown,
  intentIdFromPath: string
): RetryIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    intentId: ensureIntentId(intentIdFromPath),
  };
};

const parseSubmitDraftInput = (
  value: unknown,
  intentIdFromPath: string
): SubmitDraftIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    intentId: ensureIntentId(intentIdFromPath),
  };
};

const parseCreateBatchIntentInput = (
  value: unknown,
  batchIdFromPath?: string
): CreateBatchIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    batchId:
      batchIdFromPath === undefined
        ? ensureIntentId(body.batchId, "batchId")
        : ensureIntentId(batchIdFromPath, "batchId"),
    mode: parseBatchMode(body.mode),
  };
};

const parseAddBatchItemInput = (
  value: unknown,
  batchIdFromPath: string
): AddBatchItemInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    batchId: ensureIntentId(batchIdFromPath, "batchId"),
    intentId: ensureIntentId(body.intentId),
    recipient: ensureString(body, "recipient"),
    amount: ensureAmount(body.amount),
    memo: ensureString(body, "memo", true),
    reference: ensureString(body, "reference", true),
  };
};

const parseBatchActionInput = (
  value: unknown,
  batchIdFromPath: string
): BatchActionInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    batchId: ensureIntentId(batchIdFromPath, "batchId"),
  };
};

const parseApproveBatchIntentInput = (
  value: unknown,
  batchIdFromPath: string
): ApproveBatchIntentInput => {
  const body = ensureObject(value, "request body must be an object");

  return {
    policy: ensureString(body, "policy"),
    batchId: ensureIntentId(batchIdFromPath, "batchId"),
    approvalDigest: parseApprovalDigest(body.approvalDigest),
  };
};

const parseBatchCreateInput = (value: unknown) => {
  const body = ensureObject(value, "request body must be an object");
  const mode = parseBatchMode(body.mode);
  const policy = ensureString(body, "policy");

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  const items = body.items.map((item, index) => {
    const input = parseCreateIntentInput({
      ...ensureObject(item, `items[${index}] must be an object`),
      policy,
    });

    return {
      ...input,
      policy,
    };
  });

  return {
    policy,
    mode,
    items,
  };
};

const parseBatchApproveInput = (value: unknown) => {
  const body = ensureObject(value, "request body must be an object");
  const mode = parseBatchMode(body.mode);
  const policy = ensureString(body, "policy");

  if (!Array.isArray(body.intentIds) || body.intentIds.length === 0) {
    throw new Error("intentIds must be a non-empty array");
  }

  const intentIds = body.intentIds.map((intentId, index) =>
    ensureIntentId(intentId, `intentIds[${index}]`)
  );

  return {
    policy,
    mode,
    intentIds,
    approvalDigest: parseApprovalDigest(body.approvalDigest),
  };
};

const summaryFromResults = (
  mode: BatchMode,
  total: number,
  results: BatchResult[]
) => {
  const succeeded = results.filter(
    (item) => item.status === "succeeded"
  ).length;
  const failed = results.length - succeeded;

  return {
    mode,
    total,
    processed: results.length,
    succeeded,
    failed,
  };
};

const createUnavailableClient = (reason: string): PolicyPayClientLike => {
  const unavailableError = `control-plane client unavailable: ${reason}`;

  const throwUnavailable = async (): Promise<never> => {
    throw new Error(unavailableError);
  };

  return {
    program: {
      programId: {
        toBase58: () => "unavailable",
      },
    } as PolicyPayClientLike["program"],
    fetchPolicy: throwUnavailable,
    fetchIntent: throwUnavailable,
    fetchBatch: throwUnavailable,
    createIntent: throwUnavailable,
    createDraftIntent: throwUnavailable,
    submitDraftIntent: throwUnavailable,
    approveIntent: throwUnavailable,
    cancelIntent: throwUnavailable,
    retryIntent: throwUnavailable,
    createBatchIntent: throwUnavailable,
    addBatchItem: throwUnavailable,
    submitBatchForApproval: throwUnavailable,
    approveBatchIntent: throwUnavailable,
    cancelBatchIntent: throwUnavailable,
  };
};

export const createApp = (
  config: ControlPlaneConfig = defaultConfig(),
  dependencies: AppDependencies = {}
) => {
  const app = express();
  const auditLogStore =
    dependencies.auditLogStore ?? createAuditLogStore(config);
  let clientReady = true;
  const client = (() => {
    if (dependencies.client) {
      return dependencies.client;
    }

    try {
      return new PolicyPayClient(config);
    } catch (error) {
      clientReady = false;
      return createUnavailableClient(String(error));
    }
  })();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: clientReady,
      programId: client.program.programId.toBase58(),
      clientReady,
    });
  });

  app.get("/audit-logs", (_req, res) => {
    res.json({ items: auditLogStore.list() });
  });

  app.get("/policies/:mint", async (req, res) => {
    try {
      const account = await client.fetchPolicy(req.params.mint);
      res.json({ mint: req.params.mint, account });
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  app.get("/policies/:policy/intents/:intentId", async (req, res) => {
    try {
      const account = await client.fetchIntent(
        req.params.policy,
        req.params.intentId
      );
      res.json({
        policy: req.params.policy,
        intentId: req.params.intentId,
        account,
      });
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  app.get("/policies/:policy/batches/:batchId", async (req, res) => {
    try {
      const account = await client.fetchBatch(
        req.params.policy,
        req.params.batchId
      );
      res.json({
        policy: req.params.policy,
        batchId: req.params.batchId,
        account,
      });
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  app.post("/intents", async (req, res) => {
    try {
      const payload = parseCreateIntentInput(req.body);
      auditLogStore.append(
        buildAuditEntry("create_intent", "requested", payload)
      );

      const result = await client.createIntent(payload);
      auditLogStore.append(
        buildAuditEntry("create_intent", "succeeded", result)
      );
      res.status(201).json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("create_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/draft", async (req, res) => {
    try {
      const payload = parseCreateIntentInput(req.body);
      auditLogStore.append(
        buildAuditEntry("create_draft_intent", "requested", payload)
      );

      const result = await client.createDraftIntent(payload);
      auditLogStore.append(
        buildAuditEntry("create_draft_intent", "succeeded", result)
      );
      res.status(201).json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("create_draft_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/batch", async (req, res) => {
    try {
      const payload = parseBatchCreateInput(req.body);
      auditLogStore.append(
        buildAuditEntry("batch_create_intents", "requested", {
          policy: payload.policy,
          mode: payload.mode,
          total: payload.items.length,
        })
      );

      const results: BatchResult[] = [];

      for (const item of payload.items) {
        try {
          const result = await client.createIntent(item);
          results.push({
            intentId: item.intentId,
            status: "succeeded",
            signature: result.signature,
            paymentIntent: result.paymentIntent,
          });
        } catch (error) {
          results.push({
            intentId: item.intentId,
            status: "failed",
            error: String(error),
          });

          if (payload.mode === "abort-on-error") {
            break;
          }
        }
      }

      const summary = summaryFromResults(
        payload.mode,
        payload.items.length,
        results
      );
      const status = summary.failed === 0 ? 201 : 207;

      const responseBody = {
        policy: payload.policy,
        summary,
        results,
      };

      const auditStatus = summary.failed === 0 ? "succeeded" : "failed";
      auditLogStore.append(
        buildAuditEntry("batch_create_intents", auditStatus, responseBody)
      );

      res.status(status).json(responseBody);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("batch_create_intents", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId(\\d+)/submit", async (req, res) => {
    try {
      const payload = parseSubmitDraftInput(req.body, req.params.intentId);
      auditLogStore.append(
        buildAuditEntry("submit_draft_intent", "requested", payload)
      );

      const result = await client.submitDraftIntent(payload);
      auditLogStore.append(
        buildAuditEntry("submit_draft_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("submit_draft_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId(\\d+)/approve", async (req, res) => {
    try {
      const payload = parseApproveIntentInput(req.body, req.params.intentId);
      auditLogStore.append(
        buildAuditEntry("approve_intent", "requested", payload)
      );

      const result = await client.approveIntent(payload);
      auditLogStore.append(
        buildAuditEntry("approve_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("approve_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/batch/approve", async (req, res) => {
    try {
      const payload = parseBatchApproveInput(req.body);
      auditLogStore.append(
        buildAuditEntry("batch_approve_intents", "requested", {
          policy: payload.policy,
          mode: payload.mode,
          total: payload.intentIds.length,
        })
      );

      const results: BatchResult[] = [];

      for (const intentId of payload.intentIds) {
        try {
          const result = await client.approveIntent({
            policy: payload.policy,
            intentId,
            approvalDigest: payload.approvalDigest,
          });
          results.push({
            intentId,
            status: "succeeded",
            signature: result.signature,
            paymentIntent: result.paymentIntent,
          });
        } catch (error) {
          results.push({ intentId, status: "failed", error: String(error) });
          if (payload.mode === "abort-on-error") {
            break;
          }
        }
      }

      const summary = summaryFromResults(
        payload.mode,
        payload.intentIds.length,
        results
      );
      const status = summary.failed === 0 ? 200 : 207;

      const responseBody = {
        policy: payload.policy,
        summary,
        results,
      };

      const auditStatus = summary.failed === 0 ? "succeeded" : "failed";
      auditLogStore.append(
        buildAuditEntry("batch_approve_intents", auditStatus, responseBody)
      );

      res.status(status).json(responseBody);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("batch_approve_intents", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/batches", async (req, res) => {
    try {
      const payload = parseCreateBatchIntentInput(req.body);
      auditLogStore.append(
        buildAuditEntry("create_batch_intent_onchain", "requested", payload)
      );

      const result = await client.createBatchIntent(payload);
      auditLogStore.append(
        buildAuditEntry("create_batch_intent_onchain", "succeeded", result)
      );
      res.status(201).json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("create_batch_intent_onchain", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/batches/:batchId(\\d+)/items", async (req, res) => {
    try {
      const payload = parseAddBatchItemInput(req.body, req.params.batchId);
      auditLogStore.append(
        buildAuditEntry("add_batch_item_onchain", "requested", payload)
      );

      const result = await client.addBatchItem(payload);
      auditLogStore.append(
        buildAuditEntry("add_batch_item_onchain", "succeeded", result)
      );
      res.status(201).json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("add_batch_item_onchain", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/batches/:batchId(\\d+)/submit", async (req, res) => {
    try {
      const payload = parseBatchActionInput(req.body, req.params.batchId);
      auditLogStore.append(
        buildAuditEntry(
          "submit_batch_for_approval_onchain",
          "requested",
          payload
        )
      );

      const result = await client.submitBatchForApproval(payload);
      auditLogStore.append(
        buildAuditEntry(
          "submit_batch_for_approval_onchain",
          "succeeded",
          result
        )
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("submit_batch_for_approval_onchain", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/batches/:batchId(\\d+)/approve", async (req, res) => {
    try {
      const payload = parseApproveBatchIntentInput(
        req.body,
        req.params.batchId
      );
      auditLogStore.append(
        buildAuditEntry("approve_batch_intent_onchain", "requested", payload)
      );

      const result = await client.approveBatchIntent(payload);
      auditLogStore.append(
        buildAuditEntry("approve_batch_intent_onchain", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("approve_batch_intent_onchain", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/batches/:batchId(\\d+)/cancel", async (req, res) => {
    try {
      const payload = parseBatchActionInput(req.body, req.params.batchId);
      auditLogStore.append(
        buildAuditEntry("cancel_batch_intent_onchain", "requested", payload)
      );

      const result = await client.cancelBatchIntent(payload);
      auditLogStore.append(
        buildAuditEntry("cancel_batch_intent_onchain", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("cancel_batch_intent_onchain", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId(\\d+)/cancel", async (req, res) => {
    try {
      const payload = parseCancelInput(req.body, req.params.intentId);
      auditLogStore.append(
        buildAuditEntry("cancel_intent", "requested", payload)
      );

      const result = await client.cancelIntent(payload);
      auditLogStore.append(
        buildAuditEntry("cancel_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("cancel_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId(\\d+)/retry", async (req, res) => {
    try {
      const payload = parseRetryInput(req.body, req.params.intentId);
      auditLogStore.append(
        buildAuditEntry("retry_intent", "requested", payload)
      );

      const result = await client.retryIntent(payload);
      auditLogStore.append(
        buildAuditEntry("retry_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("retry_intent", "failed", {
          payload: req.body ?? null,
          error: String(error),
        })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  return app;
};
