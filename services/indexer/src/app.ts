import express from "express";
import {
  DOMAIN_CONTRACT,
  TIMELINE_SOURCES,
} from "../../../modules/domain/src/index";

import { indexerConfig } from "./config";
import { IndexerService } from "./service";
import { createTimelineStore } from "./timeline-store";

const parseIntentId = (value: unknown, field: string): number => {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numeric;
};

const parseStatus = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("status must be a non-empty string");
  }

  return value.trim();
};

const parseDetails = (value: unknown): Record<string, unknown> => {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("details must be an object");
  }

  return value as Record<string, unknown>;
};

export const createIndexerApp = () => {
  const config = indexerConfig();
  const service = new IndexerService(createTimelineStore(config));
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timelinePath: config.timelinePath });
  });

  app.get("/timeline", (req, res) => {
    const intentIdParam = req.query.intentId;
    const source = req.query.source;

    try {
      const intentId =
        intentIdParam === undefined
          ? undefined
          : parseIntentId(intentIdParam, "intentId");

      const sourceFilter =
        source === undefined
          ? undefined
          : TIMELINE_SOURCES.has(String(source))
          ? source
          : (() => {
              throw new Error(
                `source must be one of: ${DOMAIN_CONTRACT.timelineSources.join(
                  ", "
                )}`
              );
            })();

      const items = service.list().filter((item) => {
        if (intentId !== undefined && item.intentId !== intentId) {
          return false;
        }

        if (sourceFilter !== undefined && item.source !== sourceFilter) {
          return false;
        }

        return true;
      });

      res.json({ items });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/timeline/chain", (req, res) => {
    try {
      const intentId = parseIntentId(req.body?.intentId, "intentId");
      const status = parseStatus(req.body?.status);
      const details = parseDetails(req.body?.details);

      const result = service.recordChainStatus(intentId, status, details);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/timeline/relayer", (req, res) => {
    try {
      const intentId = parseIntentId(req.body?.intentId, "intentId");
      const status = parseStatus(req.body?.status);
      const details = parseDetails(req.body?.details);

      const result = service.recordRelayerStatus(intentId, status, details);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return app;
};
