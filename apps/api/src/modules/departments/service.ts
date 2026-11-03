import { asc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { departments, programs } from "../../db/schema";
import { ApiError } from "../../utils/api-error";
import { type AuditContext, insertAudit } from "../audit/service";
import type { CreateDepartmentInput } from "./schemas";

/**
 * Departments are reference data referenced by clubs, staff profiles, resources
 * and department-scoped role assignments. Reading is open to any authenticated
 * staff user because every picker needs it; writing is Admin-only.
 */
export async function listDepartments() {
  const { db } = getDb();
  const items = await db
    .select({ id: departments.id, code: departments.code, name: departments.name })
    .from(departments)
    .orderBy(asc(departments.name));
  return { items };
}

export async function createDepartment(input: CreateDepartmentInput, audit?: AuditContext) {
  const { db } = getDb();
  const [existing] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.code, input.code))
    .limit(1);
  if (existing) throw new ApiError("CONFLICT", "A department with that code already exists.");

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(departments).values(input).returning();
    if (!row) throw new ApiError("INTERNAL_ERROR", "Department creation failed.");
    if (audit)
      await insertAudit(tx, audit, {
        action: "DEPARTMENT_CREATED",
        entityType: "department",
        entityId: row.id,
        after: { code: row.code, name: row.name },
      });
    return row;
  });
}

export async function updateDepartment(
  id: string,
  input: { name?: string | undefined },
  audit?: AuditContext,
) {
  const { db } = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(departments).where(eq(departments.id, id)).limit(1);
    if (!before) throw new ApiError("NOT_FOUND", "Department not found.");
    const [row] = await tx
      .update(departments)
      .set({ ...(input.name === undefined ? {} : { name: input.name }) })
      .where(eq(departments.id, id))
      .returning();
    if (audit)
      await insertAudit(tx, audit, {
        action: "DEPARTMENT_UPDATED",
        entityType: "department",
        entityId: id,
        before: { name: before.name },
        after: { name: row?.name },
      });
    return row;
  });
}

export async function listPrograms() {
  const { db } = getDb();
  const items = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(eq(programs.isActive, true))
    .orderBy(asc(programs.name));
  return { items };
}

export async function createProgram(name: string, audit?: AuditContext) {
  const { db } = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(programs).values({ name }).returning();
      if (!row) throw new ApiError("INTERNAL_ERROR", "Programme creation failed.");
      if (audit)
        await insertAudit(tx, audit, {
          action: "PROGRAM_CREATED",
          entityType: "program",
          entityId: row.id,
          after: { name: row.name },
        });
      return row;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505")
      throw new ApiError("CONFLICT", "A programme with that name already exists.");
    throw error;
  }
}
