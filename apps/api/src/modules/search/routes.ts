import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db/client";
import { clubs, users } from "../../db/schema";
import { authenticate, hasRole, requireActiveAccount } from "../../middleware/auth";
import { parseQuery } from "../../middleware/validate";
import { ok } from "../../utils/response";
import { listVisibleEvents } from "../events/visibility";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/**
 * One search box for the console. Events respect the participant visibility
 * rules; clubs are limited to clubs the caller belongs to or oversees; people
 * are only exposed to administrators, never to ordinary staff.
 */
export const searchRoutes = new Hono();
searchRoutes.use("*", authenticate, requireActiveAccount);
searchRoutes.get("/", async (c) => {
  const { q, limit } = parseQuery(c, searchQuerySchema);
  const auth = c.get("auth");
  const { db } = getDb();
  const needle = `%${q}%`;

  const eventPage = await listVisibleEvents(auth, { limit, offset: 0, q });
  const memberClubIds = auth.memberships.map((m) => m.clubId);
  const seesAllClubs =
    hasRole(auth, "ADMIN") || hasRole(auth, "HOD_DEAN") || hasRole(auth, "FACULTY");
  const clubRows =
    seesAllClubs || memberClubIds.length
      ? await db
          .select({
            id: clubs.id,
            name: clubs.name,
            slug: clubs.slug,
            description: clubs.description,
          })
          .from(clubs)
          .where(
            seesAllClubs
              ? ilike(clubs.name, needle)
              : and(ilike(clubs.name, needle), inArray(clubs.id, memberClubIds)),
          )
          .limit(limit)
      : [];

  const peopleRows = hasRole(auth, "ADMIN")
    ? await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          accountType: users.accountType,
          status: users.status,
        })
        .from(users)
        .where(or(ilike(users.fullName, needle), ilike(users.email, needle)))
        .limit(limit)
    : [];

  return ok(c, {
    query: q,
    events: eventPage.items.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      startsAt: e.startsAt,
      venueSummary: e.venueSummary,
    })),
    clubs: clubRows,
    people: peopleRows,
  });
});
