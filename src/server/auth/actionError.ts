import "server-only";
import { UnauthorizedError, ForbiddenError, SubscriptionError } from "./errors";

/**
 * Turns a guard throw into a sentence a user can act on, or null if the error
 * is something else entirely (which the caller must rethrow — swallowing an
 * unknown error would hide a real bug behind a friendly message).
 *
 * These are reachable through normal use, not just tampering: a subscription
 * can lapse, or an admin can demote someone, while they have a page open. The
 * buttons stay enabled because the page was rendered before the change, so the
 * action is where the user finds out — it needs to say what actually happened.
 */
export function guardErrorMessage(err: unknown): string | null {
  if (err instanceof SubscriptionError) {
    switch (err.reason) {
      case "expired":
        return "Your subscription has expired — the app is read-only. Contact your administrator to renew.";
      case "suspended":
        return "Your subscription is suspended. Contact your administrator.";
      default:
        return "No active subscription on this organization. Contact your administrator.";
    }
  }
  if (err instanceof ForbiddenError) {
    return "You don't have permission to do that. Your access may have changed — try signing in again.";
  }
  if (err instanceof UnauthorizedError) {
    return "Your session has expired. Please sign in again.";
  }
  return null;
}
