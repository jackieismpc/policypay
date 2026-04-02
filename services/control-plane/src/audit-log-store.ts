import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

import type { ControlPlaneConfig } from "./config";
import type { AuditEntry } from "./types";

export type AuditLogStoreLike = {
  list(): AuditEntry[];
  append(entry: AuditEntry): AuditEntry;
};

export class AuditLogStore implements AuditLogStoreLike {
  constructor(private readonly filePath: string) {}

  list(): AuditEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as AuditEntry[];
  }

  append(entry: AuditEntry): AuditEntry {
    const existing = this.list();
    const next = [entry, ...existing].slice(0, 200);

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2));

    return entry;
  }
}

export class SqliteAuditLogStore implements AuditLogStoreLike {
  private readonly db: DatabaseSync;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS control_plane_audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_control_plane_audit_logs_created_at
      ON control_plane_audit_logs(created_at DESC);
    `);
  }

  list(): AuditEntry[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, action, status, created_at, details_json
          FROM control_plane_audit_logs
          ORDER BY created_at DESC, rowid DESC
          LIMIT 200
        `
      )
      .all() as Array<{
      id: string;
      action: string;
      status: AuditEntry["status"];
      created_at: string;
      details_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      createdAt: row.created_at,
      details: JSON.parse(row.details_json) as Record<string, unknown>,
    }));
  }

  append(entry: AuditEntry): AuditEntry {
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO control_plane_audit_logs (
            id, action, status, created_at, details_json
          ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        entry.id,
        entry.action,
        entry.status,
        entry.createdAt,
        JSON.stringify(entry.details)
      );

    return entry;
  }
}

export const createAuditLogStore = (
  config: Pick<
    ControlPlaneConfig,
    "storageDriver" | "auditLogPath" | "sqlitePath"
  >
): AuditLogStoreLike => {
  if (config.storageDriver === "json") {
    return new AuditLogStore(config.auditLogPath);
  }

  return new SqliteAuditLogStore(config.sqlitePath);
};
