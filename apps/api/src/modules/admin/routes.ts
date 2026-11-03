import { count, desc } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../db/client";
import { jobRuns, notificationOutbox } from "../../db/schema";
import { authenticate, requireActiveAccount, requireRole } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rate-limit";
import { parseJson, parseQuery } from "../../middleware/validate";
import { ok } from "../../utils/response";
import { auditContext } from "../audit/service";
import * as schemas from "./schemas";
import * as service from "./service";

const { db } = getDb();

export const adminRoutes = new Hono();
adminRoutes.use("*", authenticate, requireActiveAccount, requireRole("ADMIN"));

adminRoutes.get("/users", async (c) =>
  ok(c, await service.listUsers(parseQuery(c, schemas.listUsersSchema))),
);

adminRoutes.get("/users/:id", async (c) => ok(c, await service.getUserDetail(c.req.param("id"))));

adminRoutes.post(
  "/staff",
  rateLimit({ windowMs: 60_000, max: 20, prefix: "provision-staff" }),
  async (c) => {
    const input = await parseJson(c, schemas.provisionStaffSchema);
    const result = await service.provisionStaff(input, auditContext(c));
    return ok(c, result, 201);
  },
);

adminRoutes.post("/users/:id/roles", async (c) => {
  const input = await parseJson(c, schemas.grantRoleSchema);
  const row = await service.grantRole(
    c.get("auth").user.id,
    c.req.param("id"),
    input,
    auditContext(c),
  );
  return ok(c, row, 201);
});

adminRoutes.delete("/users/:id/roles/:assignmentId", async (c) => {
  const row = await service.revokeRole(
    c.req.param("id"),
    c.req.param("assignmentId"),
    auditContext(c),
  );
  return ok(c, row);
});

adminRoutes.post("/users/:id/suspend", async (c) => {
  const input = await parseJson(c, schemas.suspendSchema);
  const result = await service.suspendUser(
    c.get("auth").user.id,
    c.req.param("id"),
    input,
    auditContext(c),
  );
  return ok(c, result);
});

adminRoutes.post("/users/:id/reactivate", async (c) => {
  const input = await parseJson(c, schemas.reactivateSchema);
  const result = await service.reactivateUser(c.req.param("id"), input, auditContext(c));
  return ok(c, result);
});

adminRoutes.post("/jobs/maintenance", async (c) => {
  const { runMaintenance } = await import("../../jobs/maintenance");
  return ok(c, await runMaintenance());
});

adminRoutes.get("/jobs", async (c) => {
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(20);
  const counts = await db
    .select({ status: notificationOutbox.status, n: count() })
    .from(notificationOutbox)
    .groupBy(notificationOutbox.status);
  const byStatus = new Map(counts.map((r) => [r.status, Number(r.n)]));
  return ok(c, {
    runs,
    outbox: {
      pending: byStatus.get("PENDING") ?? 0,
      failed: byStatus.get("FAILED") ?? 0,
      sent: byStatus.get("SENT") ?? 0,
      skipped: byStatus.get("SKIPPED") ?? 0,
    },
  });
});
