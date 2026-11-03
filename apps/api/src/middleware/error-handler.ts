import type { ErrorHandler } from "hono";
import { ApiError } from "../utils/api-error";
import { fail } from "../utils/response";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) return fail(c, err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  if (code === "22P02" || code === "22007" || code === "22008") {
    return fail(c, new ApiError("VALIDATION_ERROR", "Invalid identifier or date format."));
  }
  console.error(`[${c.get("requestId") ?? "no-request-id"}]`, err);
  return fail(c, new ApiError("INTERNAL_ERROR", "An unexpected error occurred."));
};
