import path from "path";

export type StorageDriver = "sqlite" | "json";

const rootDir = path.resolve(__dirname, "../../..");

const parseStorageDriver = (value?: string): StorageDriver =>
  value === "json" ? "json" : "sqlite";

export const relayerConfig = () => ({
  port: Number(process.env.RELAYER_PORT ?? 24020),
  controlPlaneBaseUrl:
    process.env.CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:24010",
  storageDriver: parseStorageDriver(
    process.env.RELAYER_STORAGE_DRIVER ?? process.env.POLICYPAY_STORAGE_DRIVER
  ),
  sqlitePath:
    process.env.RELAYER_SQLITE_PATH ??
    process.env.POLICYPAY_SQLITE_PATH ??
    path.join(rootDir, "data/policypay.sqlite"),
  storePath:
    process.env.RELAYER_STORE_PATH ??
    path.join(rootDir, "services/relayer/data/records.json"),
});
