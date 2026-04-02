import { createIndexerApp } from "./app";
import { indexerConfig } from "./config";

const config = indexerConfig();
const app = createIndexerApp();

app.listen(config.port, () => {
  console.log(JSON.stringify({ service: "indexer", port: config.port }));
});
