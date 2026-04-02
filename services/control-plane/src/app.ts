import express from "express";

import { AuditLogStore } from "./audit-log-store";
import type { ControlPlaneConfig } from "./config";
import { defaultConfig } from "./config";
import { PolicyPayClient } from "./policy-pay-client";
import { buildAuditEntry } from "./types";

export const createApp = (config: ControlPlaneConfig = defaultConfig()) => {
  const app = express();
  const auditLogStore = new AuditLogStore(config.auditLogPath);
  const client = new PolicyPayClient(config);

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, programId: client.program.programId.toBase58() });
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

  app.post("/intents", async (req, res) => {
    const entry = buildAuditEntry("create_intent", "requested", req.body ?? {});
    auditLogStore.append(entry);

    try {
      const result = await client.createIntent(req.body);
      auditLogStore.append(
        buildAuditEntry("create_intent", "succeeded", result)
      );
      res.status(201).json(result);
    } catch (error) {
      const failure = buildAuditEntry("create_intent", "failed", {
        error: String(error),
      });
      auditLogStore.append(failure);
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId/approve", async (req, res) => {
    const payload = {
      policy: req.body?.policy,
      intentId: Number(req.params.intentId),
      approvalDigest: req.body?.approvalDigest ?? Array(32).fill(0),
    };
    auditLogStore.append(
      buildAuditEntry("approve_intent", "requested", payload)
    );

    try {
      const result = await client.approveIntent(payload);
      auditLogStore.append(
        buildAuditEntry("approve_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("approve_intent", "failed", { error: String(error) })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId/cancel", async (req, res) => {
    const payload = {
      policy: req.body?.policy,
      intentId: Number(req.params.intentId),
    };
    auditLogStore.append(
      buildAuditEntry("cancel_intent", "requested", payload)
    );

    try {
      const result = await client.cancelIntent(payload);
      auditLogStore.append(
        buildAuditEntry("cancel_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("cancel_intent", "failed", { error: String(error) })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/intents/:intentId/retry", async (req, res) => {
    const payload = {
      policy: req.body?.policy,
      intentId: Number(req.params.intentId),
    };
    auditLogStore.append(buildAuditEntry("retry_intent", "requested", payload));

    try {
      const result = await client.retryIntent(payload);
      auditLogStore.append(
        buildAuditEntry("retry_intent", "succeeded", result)
      );
      res.json(result);
    } catch (error) {
      auditLogStore.append(
        buildAuditEntry("retry_intent", "failed", { error: String(error) })
      );
      res.status(400).json({ error: String(error) });
    }
  });

  return app;
};
