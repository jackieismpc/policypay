import fs from "fs";
import path from "path";

export type RelayerRecord = {
  intentId: number;
  paymentIntent: string;
  status: "submitted" | "confirmed" | "failed";
  signature?: string;
  failureReason?: string;
  updatedAt: string;
};

export class RelayerStore {
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
