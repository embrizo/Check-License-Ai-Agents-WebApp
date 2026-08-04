import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Dead man's switch. The app can report its own errors, but it fundamentally
 * cannot report *not running* — if Vercel Cron stops firing after a bad
 * deploy, a plan change, or a config typo, there is no request, no log line
 * and no row to notice. Something outside the system has to expect a signal
 * and complain when it stops arriving.
 *
 * Point HEARTBEAT_URL at a check on healthchecks.io / Better Stack / Cronitor
 * configured to expect a ping every 24h with an hour of grace. That external
 * service, not this code, is what emails you when the alerter goes quiet.
 *
 * Optional by design: unset, this is a no-op, so local and preview
 * environments don't page anyone.
 */
export async function pingHeartbeat(outcome: "success" | "failure", detail?: string): Promise<void> {
  const { HEARTBEAT_URL } = getEnv();
  if (!HEARTBEAT_URL) return;

  // healthchecks.io convention: append /fail to signal a failed run.
  const url = outcome === "failure" ? `${HEARTBEAT_URL.replace(/\/$/, "")}/fail` : HEARTBEAT_URL;

  try {
    await fetch(url, {
      method: "POST",
      body: detail?.slice(0, 10_000) ?? "",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Never let monitoring break the thing it monitors: a heartbeat provider
    // being down must not fail a run that actually sent its emails. The missed
    // ping is itself the alert on the provider's side.
    console.error("[heartbeat] ping failed", err);
  }
}
