import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

import type { relayerConfig } from "./config";

export type RelayerRecord = {
  intentId: number;
  paymentIntent: string;
  status: "submitted" | "confirmed" | "failed";
  signature?: string;
  failureReason?: string;
  updatedAt: string;
};

export type RelayerStoreLike = {
  list(): RelayerRecord[];
  upsert(record: RelayerRecord): RelayerRecord;
};

export class RelayerStore implements RelayerStoreLike {
  constructor(private readonly filePath: string) {}

  list(): RelayerRecord[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return JSON.parse(
      fs.readFileSync(this.filePath, "utf8")
    ) as RelayerRecord[];
  }

  upsert(record: RelayerRecord): RelayerRecord {
    const items = this.list().filter(
      (item) => item.intentId !== record.intentId
    );
    const next = [record, ...items].slice(0, 200);

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2));

    return record;
  }
}

export class SqliteRelayerStore implements RelayerStoreLike {
  private readonly db: DatabaseSync;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS relayer_executions (
        intent_id INTEGER PRIMARY KEY,
        payment_intent TEXT NOT NULL,
        status TEXT NOT NULL,
        signature TEXT,
        failure_reason TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_relayer_executions_updated_at
      ON relayer_executions(updated_at DESC);
    `);
  }

  list(): RelayerRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            intent_id,
            payment_intent,
            status,
            signature,
            failure_reason,
            updated_at
          FROM relayer_executions
          ORDER BY updated_at DESC, intent_id DESC
          LIMIT 200
        `
      )
      .all() as Array<{
      intent_id: number;
      payment_intent: string;
      status: RelayerRecord["status"];
      signature: string | null;
      failure_reason: string | null;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      intentId: row.intent_id,
      paymentIntent: row.payment_intent,
      status: row.status,
      signature: row.signature ?? undefined,
      failureReason: row.failure_reason ?? undefined,
      updatedAt: row.updated_at,
    }));
  }

  upsert(record: RelayerRecord): RelayerRecord {
    this.db
      .prepare(
        `
          INSERT INTO relayer_executions (
            intent_id,
            payment_intent,
            status,
            signature,
            failure_reason,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(intent_id) DO UPDATE SET
            payment_intent = excluded.payment_intent,
            status = excluded.status,
            signature = excluded.signature,
            failure_reason = excluded.failure_reason,
            updated_at = excluded.updated_at
        `
      )
      .run(
        record.intentId,
        record.paymentIntent,
        record.status,
        record.signature ?? null,
        record.failureReason ?? null,
        record.updatedAt
      );

    return record;
  }
}

type RelayerConfigLike = ReturnType<typeof relayerConfig>;

export const createRelayerStore = (
  config: Pick<RelayerConfigLike, "storageDriver" | "storePath" | "sqlitePath">
): RelayerStoreLike => {
  if (config.storageDriver === "json") {
    return new RelayerStore(config.storePath);
  }

  return new SqliteRelayerStore(config.sqlitePath);
};
