import { createApp } from "./app";
import { defaultConfig } from "./config";

const config = defaultConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      service: "control-plane",
      port: config.port,
      rpcUrl: config.rpcUrl,
    })
  );
});
