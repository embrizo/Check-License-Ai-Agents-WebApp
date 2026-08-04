// Deliberately not `server-only`: this is a pure predicate over an error
// object with no I/O and no secrets, and the nested shape it has to cope with
// is subtle enough to be worth unit-testing directly.
interface PgErrorish {
  code?: string;
  constraint?: string;
  message?: string;
  cause?: unknown;
  sourceError?: unknown;
}

/**
 * Postgres raises 23505 for a unique-index violation. Racy check-then-insert
 * can't prevent these — two requests can both pass a pre-check — so the insert
 * itself is the only real guard, and callers need to turn the throw into a
 * typed error state rather than letting it hit an error boundary.
 *
 * The check walks the cause chain because Drizzle wraps driver errors: what
 * reaches the caller is a plain `Error` whose `code`/`constraint` are
 * undefined, with the real NeonDbError (carrying both) hanging off `.cause`.
 * Inspecting only the top level silently classifies every duplicate as an
 * unknown error, which is exactly the crash this is meant to prevent.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  for (const candidate of unwrap(err)) {
    if (!isDuplicate(candidate)) continue;
    if (!constraint) return true;
    if (candidate.constraint === constraint) return true;
    if (candidate.message?.includes(constraint)) return true;
  }
  return false;
}

function isDuplicate(e: PgErrorish): boolean {
  return e.code === "23505"
    || (e.message?.includes("duplicate key value violates unique constraint") ?? false);
}

/** Yields the error and everything nested under `cause` / `sourceError`. */
function* unwrap(err: unknown, depth = 0): Generator<PgErrorish> {
  if (depth > 5 || typeof err !== "object" || err === null) return;
  const e = err as PgErrorish;
  yield e;
  yield* unwrap(e.cause, depth + 1);
  yield* unwrap(e.sourceError, depth + 1);
}
