import path from "path";

export type StorageDriver = "sqlite" | "json";

const rootDir = path.resolve(__dirname, "../../..");

const parseStorageDriver = (value?: string): StorageDriver =>
  value === "json" ? "json" : "sqlite";

export const indexerConfig = () => ({
  port: Number(process.env.INDEXER_PORT ?? 24030),
  storageDriver: parseStorageDriver(
    process.env.INDEXER_STORAGE_DRIVER ?? process.env.POLICYPAY_STORAGE_DRIVER
  ),
  sqlitePath:
    process.env.INDEXER_SQLITE_PATH ??
    process.env.POLICYPAY_SQLITE_PATH ??
    path.join(rootDir, "data/policypay.sqlite"),
  timelinePath:
    process.env.INDEXER_TIMELINE_PATH ??
    path.join(rootDir, "services/indexer/data/timeline.json"),
});
