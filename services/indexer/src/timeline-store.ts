import fs from "fs";
import path from "path";

export type IndexedTimelineEntry = {
  intentId: number;
  status: string;
  source: "chain" | "relayer";
  observedAt: string;
  details: Record<string, unknown>;
};

export class TimelineStore {
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
