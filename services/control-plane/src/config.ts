import path from "path";

export type ControlPlaneConfig = {
  rpcUrl: string;
  walletPath: string;
  idlPath: string;
  auditLogPath: string;
  port: number;
};

const rootDir = path.resolve(__dirname, "../../..");

export const defaultConfig = (): ControlPlaneConfig => ({
  rpcUrl: process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899",
  walletPath:
    process.env.ANCHOR_WALLET ?? path.join(rootDir, "wallets/localnet.json"),
  idlPath: path.join(rootDir, "target/idl/policy_pay.json"),
  auditLogPath: path.join(
    rootDir,
    "services/control-plane/data/audit-log.json"
  ),
  port: Number(process.env.CONTROL_PLANE_PORT ?? 4010),
});
