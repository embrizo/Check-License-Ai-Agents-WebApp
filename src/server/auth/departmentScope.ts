import "server-only";
import { eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { UserRole } from "@/db/schema";

/**
 * How far a caller may see within their organization, by department. This is the
 * department analogue of the orgId scoping in requireOrgAccess — same app-level
 * (not RLS) enforcement model as docs/01 D4.
 *
 *   { all: true }           → every department          (org_admin, super_admin)
 *   { departmentId: "..." } → only that department's rows
 *   { departmentId: null }  → only unfiled rows          (a member with no
 *                             department — they see legacy/null data, never
 *                             another department's)
 *
 * The `{ departmentId: null }` case is the load-bearing safety property: an
 * unassigned member must fall back to "sees only null-department data", NOT to
 * "sees everything". That is why this is a tagged union rather than a plain
 * `string | null` that a query might treat as "no filter".
 */
export type DepartmentScope = { all: true } | { departmentId: string | null };

/** org_admin and super_admin see every department; a member is confined to theirs. */
export function departmentScopeFor(
  user: { role: UserRole; departmentId: string | null },
): DepartmentScope {
  if (user.role === "org_admin" || user.role === "super_admin") return { all: true };
  return { departmentId: user.departmentId };
}

/**
 * Turn a scope into a WHERE condition on a table's `department_id` column, or
 * `undefined` when the caller may see every department (no filter). Pass the
 * result through drizzle's `and(...)` — `and()` ignores `undefined` terms, so
 * the "all" case adds nothing.
 */
export function departmentCondition(column: AnyPgColumn, scope: DepartmentScope): SQL | undefined {
  if ("all" in scope) return undefined;
  return scope.departmentId === null ? isNull(column) : eq(column, scope.departmentId);
}

/**
 * Which department new data should be filed under. A scoped member can only ever
 * write into their OWN department, so any `requested` value they somehow sent is
 * ignored — they can't file data into a department they can't see. Only a caller
 * who sees every department (org_admin/super_admin) may choose, via `requested`
 * (which the caller must still validate belongs to the org). This is the write
 * mirror of departmentCondition's read filter.
 */
export function resolveWriteDepartment(scope: DepartmentScope, requested: string | null): string | null {
  return "all" in scope ? requested : scope.departmentId;
}
