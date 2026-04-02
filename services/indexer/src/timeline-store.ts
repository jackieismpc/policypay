import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

import type { indexerConfig } from "./config";

export type IndexedTimelineEntry = {
  intentId: number;
  status: string;
  source: "chain" | "relayer";
  observedAt: string;
  details: Record<string, unknown>;
};

export type TimelineStoreLike = {
  list(): IndexedTimelineEntry[];
  append(entry: IndexedTimelineEntry): IndexedTimelineEntry;
};

export class TimelineStore implements TimelineStoreLike {
  constructor(private readonly filePath: string) {}

  list(): IndexedTimelineEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return JSON.parse(
      fs.readFileSync(this.filePath, "utf8")
    ) as IndexedTimelineEntry[];
  }

  append(entry: IndexedTimelineEntry): IndexedTimelineEntry {
    const items = [entry, ...this.list()].slice(0, 500);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
    return entry;
  }
}

export class SqliteTimelineStore implements TimelineStoreLike {
  private readonly db: DatabaseSync;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS indexer_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_indexer_timeline_observed_at
      ON indexer_timeline(observed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_indexer_timeline_intent
      ON indexer_timeline(intent_id);
    `);
  }

  list(): IndexedTimelineEntry[] {
    const rows = this.db
      .prepare(
        `
          SELECT intent_id, status, source, observed_at, details_json
          FROM indexer_timeline
          ORDER BY id DESC
          LIMIT 500
        `
      )
      .all() as Array<{
      intent_id: number;
      status: string;
      source: IndexedTimelineEntry["source"];
      observed_at: string;
      details_json: string;
    }>;

    return rows.map((row) => ({
      intentId: row.intent_id,
      status: row.status,
      source: row.source,
      observedAt: row.observed_at,
      details: JSON.parse(row.details_json) as Record<string, unknown>,
    }));
  }

  append(entry: IndexedTimelineEntry): IndexedTimelineEntry {
    this.db
      .prepare(
        `
          INSERT INTO indexer_timeline (
            intent_id,
            status,
            source,
            observed_at,
            details_json
          ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        entry.intentId,
        entry.status,
        entry.source,
        entry.observedAt,
        JSON.stringify(entry.details)
      );

    return entry;
  }
}

type IndexerConfigLike = ReturnType<typeof indexerConfig>;

export const createTimelineStore = (
  config: Pick<
    IndexerConfigLike,
    "storageDriver" | "timelinePath" | "sqlitePath"
  >
): TimelineStoreLike => {
  if (config.storageDriver === "json") {
    return new TimelineStore(config.timelinePath);
  }

  return new SqliteTimelineStore(config.sqlitePath);
};
