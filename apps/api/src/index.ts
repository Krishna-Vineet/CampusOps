import { createApp } from "./app";
import { env } from "./config/env";
import { startJobs, stopJobs } from "./jobs";

const app = createApp();

const server = Bun.serve({
  port: env.PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
  idleTimeout: 30,
});

console.log(`CampusOps API listening on http://0.0.0.0:${server.port}`);
startJobs();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopJobs();
    server.stop();
    process.exit(0);
  });
}
