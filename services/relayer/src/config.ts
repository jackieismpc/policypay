import path from "path";

const rootDir = path.resolve(__dirname, "../../..");

export const relayerConfig = () => ({
  port: Number(process.env.RELAYER_PORT ?? 4020),
  controlPlaneBaseUrl:
    process.env.CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:4010",
  storePath: path.join(rootDir, "services/relayer/data/records.json"),
});
