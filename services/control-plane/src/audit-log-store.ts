import fs from "fs";
import path from "path";

import type { AuditEntry } from "./types";

export class AuditLogStore {
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
