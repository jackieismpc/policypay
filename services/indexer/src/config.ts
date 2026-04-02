import path from "path";

const rootDir = path.resolve(__dirname, "../../..");

export const indexerConfig = () => ({
  timelinePath: path.join(rootDir, "services/indexer/data/timeline.json"),
});
