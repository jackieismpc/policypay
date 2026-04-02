import express from "express";

import { relayerConfig } from "./config";
import { RelayerService } from "./service";
import { RelayerStore } from "./store";

export const createRelayerApp = () => {
  const config = relayerConfig();
  const store = new RelayerStore(config.storePath);
  const service = new RelayerService(store);
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, controlPlaneBaseUrl: config.controlPlaneBaseUrl });
  });

  app.get("/executions", (_req, res) => {
    res.json({ items: service.list() });
  });

  app.post("/executions", async (req, res) => {
    try {
      const result = await service.process(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.post("/executions/:intentId/confirm", async (req, res) => {
    try {
      const result = await service.confirm(Number(req.params.intentId));
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: String(error) });
    }
  });

  return app;
};
