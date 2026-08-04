import "server-only";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/server/mail/send";
import type { DailyCheckStats } from "./dailyCheck";

/**
 * Emails whoever runs this deployment when a run had failures.
 *
 * Distinct from the heartbeat: the heartbeat catches "the job never ran", this
 * catches "the job ran and couldn't deliver". Both are needed — neither
 * detects the other's failure mode.
 *
 * Optional (OPS_ALERT_EMAIL unset = no-op) so dev and preview stay quiet.
 */
export async function notifyOperatorOfFailures(stats: DailyCheckStats): Promise<void> {
  const { OPS_ALERT_EMAIL } = getEnv();
  if (!OPS_ALERT_EMAIL) return;

  const detail = stats.errorDetail.length > 0
    ? stats.errorDetail.join("\n")
    : "(no detail captured)";

  const text = [
    `The daily license-expiry check finished with ${stats.errors} error(s).`,
    "",
    `Organizations processed: ${stats.orgsProcessed}`,
    `Emails sent:             ${stats.sent}`,
    `Errors:                  ${stats.errors}`,
    "",
    "Detail:",
    detail,
    "",
    "Alerts that failed were NOT logged as sent, so they will be retried on the",
    "next run — but they will keep failing until the underlying cause is fixed.",
  ].join("\n");

  try {
    await sendEmail({
      to: [OPS_ALERT_EMAIL],
      subject: `[License Alerts] Daily check had ${stats.errors} error(s)`,
      text,
      html: `<pre>${escapeHtml(text)}</pre>`,
    });
  } catch (err) {
    // If the mailer is the thing that's broken, this send fails too. That's
    // what the heartbeat is for — don't let it turn into an unhandled throw.
    console.error("[opsAlert] failed to notify operator", err);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
