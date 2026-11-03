import { Hono } from "hono";
import { authenticate, requireActiveAccount, requireRole } from "../../middleware/auth";
import { parseJson } from "../../middleware/validate";
import { ok } from "../../utils/response";
import { auditContext } from "../audit/service";
import * as schemas from "./schemas";
import * as service from "./service";

export const departmentRoutes = new Hono();
departmentRoutes.use("*", authenticate, requireActiveAccount);

// Any active account may read the list: club, resource and staff forms need it.
departmentRoutes.get("/", async (c) => ok(c, await service.listDepartments()));

departmentRoutes.post("/", requireRole("ADMIN"), async (c) => {
  const input = await parseJson(c, schemas.createDepartmentSchema);
  return ok(c, await service.createDepartment(input, auditContext(c)), 201);
});

departmentRoutes.patch("/:id", requireRole("ADMIN"), async (c) => {
  const input = await parseJson(c, schemas.updateDepartmentSchema);
  return ok(c, await service.updateDepartment(c.req.param("id"), input, auditContext(c)));
});
