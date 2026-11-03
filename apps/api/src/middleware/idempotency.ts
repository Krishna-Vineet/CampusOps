import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { authConfig } from "../config/env";
import { getDb } from "../db/client";
import { idempotencyKeys } from "../db/schema";
import { ApiError } from "../utils/api-error";
import { hashToken } from "../utils/tokens";

export function idempotent(scope: string) {
  return createMiddleware(async (c, next) => {
    const key = c.req.header("idempotency-key");
    if (!key) return next();
    if (key.length > 200) throw new ApiError("VALIDATION_ERROR", "Idempotency-Key is too long.");
    const cfg = authConfig();
    const actor = c.get("auth")?.user.id ?? "public";
    const body = await c.req.raw.clone().text();
    const requestHash =
      hashToken(`${c.req.method}:${c.req.path}:${actor}:${body}`, cfg.refreshPepper) ?? "";
    const fullScope = `${scope}:${actor}`;
    const { db } = getDb();
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, fullScope)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ApiError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key was used with a different request.",
        );
      return c.json(existing.responseBody, existing.responseStatus as 200);
    }
    await next();
    const res = c.res;
    if (res.status >= 500) return;
    const clone = res.clone();
    const json = await clone.json().catch(() => null);
    if (json) {
      await db
        .insert(idempotencyKeys)
        .values({
          key,
          scope: fullScope,
          requestHash,
          responseStatus: res.status,
          responseBody: json,
        })
        .onConflictDoNothing();
    }
  });
}
