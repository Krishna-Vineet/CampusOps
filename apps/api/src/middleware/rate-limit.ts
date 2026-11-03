import { sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { authConfig, env } from "../config/env";
import { getDb } from "../db/client";
import { ApiError } from "../utils/api-error";
import { hashToken } from "../utils/tokens";

export function clientIp(headers: Headers): string {
  if (!env.TRUST_PROXY_HEADERS) return "direct";
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "direct"
  );
}

/**
 * `keyBy: "user"` buckets by account instead of address. Participant-facing
 * endpoints need it: at a venue every student shares the campus Wi-Fi's public
 * IP, so an address bucket would throttle the whole crowd as if it were one
 * person. Sign-in and registration stay address-keyed because there is no
 * authenticated account yet.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  prefix: string;
  keyBy?: "ip" | "user";
}) {
  return createMiddleware(async (c, next) => {
    if (process.env.NODE_ENV === "test") return next();
    const { db } = getDb();
    const cfg = authConfig();
    const identity =
      options.keyBy === "user"
        ? (c.get("auth")?.user.id ?? clientIp(c.req.raw.headers))
        : clientIp(c.req.raw.headers);
    const keyHash = hashToken(`${options.prefix}:${identity}`, cfg.refreshPepper) ?? "";
    const expiresAt = new Date(Date.now() + options.windowMs);
    const rows = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limit_buckets (key_hash, count, expires_at)
      VALUES (${keyHash}, 1, ${expiresAt.toISOString()})
      ON CONFLICT (key_hash) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.expires_at < now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
        expires_at = CASE WHEN rate_limit_buckets.expires_at < now() THEN ${expiresAt.toISOString()}::timestamptz ELSE rate_limit_buckets.expires_at END
      RETURNING count
    `);
    const count = Number(rows[0]?.count ?? 1);
    const max = options.max * env.RATE_LIMIT_SCALE;
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - count)));
    if (count > max) throw new ApiError("RATE_LIMITED", "Too many requests. Try again later.");
    await next();
  });
}
