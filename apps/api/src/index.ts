import { createApp } from "./app";
import { env } from "./config/env";
import { closeDb, getDb } from "./db/client";
import { startJobs, stopJobs } from "./jobs";
import { maintenanceTick } from "./middleware/maintenance";
import { log } from "./utils/logger";

const app = createApp();

const server = Bun.serve({
  port: env.PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
  idleTimeout: 30,
});

log.info("api_started", {
  port: server.port,
  environment: env.NODE_ENV,
  institution: env.INSTITUTION_NAME,
});
if (env.NODE_ENV === "production" && !env.TRUST_PROXY_HEADERS)
  log.warn("proxy_headers_not_trusted", {
    detail:
      "Rate limiting will use socket addresses. Set TRUST_PROXY_HEADERS=true on a proxied host.",
  });
startJobs();
// A sleeping free host cannot run cron. Nudge the first pass as soon as the
// process is awake, then let ordinary traffic keep it on schedule.
maintenanceTick(true);

process.on("unhandledRejection", (reason) => {
  log.error("unhandled_rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on("uncaughtException", (err) => {
  log.error("uncaught_exception", { error: err.message, stack: err.stack });
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("api_stopping", { signal });
    stopJobs();
    // Stop accepting, give in-flight requests a bounded window, then close the pool.
    const drain = Promise.resolve(server.stop());
    await Promise.race([drain, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    try {
      await closeDb(getDb());
    } catch {
      // The pool may never have opened (for example, a config failure at boot).
    }
    process.exit(0);
  });
}
