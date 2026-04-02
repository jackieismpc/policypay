import path from "path";

const rootDir = path.resolve(__dirname, "../../..");

export const indexerConfig = () => ({
  port: Number(process.env.INDEXER_PORT ?? 4040),
  timelinePath:
    process.env.INDEXER_TIMELINE_PATH ??
    path.join(rootDir, "services/indexer/data/timeline.json"),
});
