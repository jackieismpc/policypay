import { createRelayerApp } from "./app";
import { relayerConfig } from "./config";

const config = relayerConfig();
const app = createRelayerApp();

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      service: "relayer",
      port: config.port,
      controlPlaneBaseUrl: config.controlPlaneBaseUrl,
    })
  );
});
