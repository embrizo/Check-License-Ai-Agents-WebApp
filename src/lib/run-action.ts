"use client";

import { toast } from "sonner";

type ActionResult = { error?: string } | { ok: true } | void | undefined;

/**
 * Every Server Action call from a client component goes through here.
 *
 * Two failure modes are easy to miss when calling an action directly:
 * a returned `{ error }` gets ignored, and a *thrown* error (a guard
 * rejection, a dropped connection) rejects the promise so the success toast
 * that follows the `await` never runs — leaving the user staring at a button
 * that did nothing with no explanation either way. This collapses both into a
 * visible toast and a boolean the caller can branch on.
 */
export async function runAction(
  action: () => Promise<ActionResult>,
  successMessage: string,
): Promise<boolean> {
  try {
    const result = await action();
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(successMessage);
    return true;
  } catch {
    // Next masks Server Action errors in production, so there's no useful
    // detail to show here — anything specific must come back as `{ error }`.
    toast.error("Something went wrong — your change wasn't saved. Please refresh and try again.");
    return false;
  }
}
