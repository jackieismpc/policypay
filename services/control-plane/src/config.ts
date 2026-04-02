import path from "path";

export type StorageDriver = "sqlite" | "json";

export type ControlPlaneConfig = {
  rpcUrl: string;
  walletPath: string;
  idlPath: string;
  auditLogPath: string;
  sqlitePath: string;
  storageDriver: StorageDriver;
  port: number;
};

const rootDir = path.resolve(__dirname, "../../..");

const parseStorageDriver = (value?: string): StorageDriver =>
  value === "json" ? "json" : "sqlite";

export const defaultConfig = (): ControlPlaneConfig => ({
  rpcUrl: process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899",
  walletPath:
    process.env.ANCHOR_WALLET ?? path.join(rootDir, "wallets/localnet.json"),
  idlPath: path.join(rootDir, "target/idl/policy_pay.json"),
  auditLogPath: path.join(
    rootDir,
    "services/control-plane/data/audit-log.json"
  ),
  sqlitePath:
    process.env.CONTROL_PLANE_SQLITE_PATH ??
    process.env.POLICYPAY_SQLITE_PATH ??
    path.join(rootDir, "data/policypay.sqlite"),
  storageDriver: parseStorageDriver(
    process.env.CONTROL_PLANE_STORAGE_DRIVER ??
      process.env.POLICYPAY_STORAGE_DRIVER
  ),
  port: Number(process.env.CONTROL_PLANE_PORT ?? 24010),
});
