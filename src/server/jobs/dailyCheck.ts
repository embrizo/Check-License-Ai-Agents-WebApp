import "server-only";
import { listActiveOrgIds } from "@/server/data/admin/subscriptions";
import { listAlertCandidates } from "@/server/data/licenses";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { listContactsByOrg } from "@/server/data/contacts";
import { hasAlertBeenSent, recordAlert } from "@/server/data/alertLog";
import { isUniqueViolation } from "@/server/data/errors";
import { startJobRun, finishJobRun, DAILY_CHECK } from "@/server/data/admin/jobRuns";
import { daysRemaining, isSendHour } from "@/server/domain/thresholds";
import { matchesProductFilter, selectThreshold, dedupKey, buildRecipients } from "@/server/domain/alertLogic";
import { renderAlertEmail } from "@/server/domain/alertTemplate";
import { sendEmail } from "@/server/mail/send";
import { pingHeartbeat } from "./heartbeat";
import { notifyOperatorOfFailures } from "./opsAlert";

export interface DailyCheckStats {
  orgsProcessed: number;
  sent: number;
  skippedDuplicate: number;
  skippedPattern: number;
  errors: number;
  /** Why sends failed — kept so a failure is diagnosable without log archaeology. */
  errorDetail: string[];
}

/** Enough to triage; not so much that one bad org fills the column. */
const MAX_RECORDED_ERRORS = 20;

/**
 * Orchestrates the daily alert run — port of engine/alerts/engine.py's
 * `run_alerts`, extended to loop per organization (docs/01 §3.2). Impure by
 * necessity (real DB + Resend calls); the actual decisions it makes are
 * delegated to the pure, unit-tested functions in server/domain/alertLogic.ts
 * so this orchestrator stays thin.
 */
export async function runDailyCheck(now: Date = new Date()): Promise<DailyCheckStats> {
  return runDailyCheckInternal("cron", now);
}

/**
 * Wraps the run in a `job_runs` row, a heartbeat ping and an operator email.
 *
 * This is the only way anyone finds out the alerter has stopped. The row is
 * opened before the work and closed after, so a crash leaves an unfinished
 * row rather than nothing; the heartbeat covers the case the row can't — the
 * job never starting at all, where there is no code of ours running to notice.
 */
export async function runDailyCheckTracked(
  trigger: "cron" | "manual",
  now: Date = new Date(),
): Promise<DailyCheckStats> {
  const runId = await startJobRun(DAILY_CHECK, trigger);

  try {
    const stats = await runDailyCheckInternal(trigger, now);
    const ok = stats.errors === 0;

    await finishJobRun(runId, {
      ok,
      orgsProcessed: stats.orgsProcessed,
      sent: stats.sent,
      skippedDuplicate: stats.skippedDuplicate,
      skippedPattern: stats.skippedPattern,
      errors: stats.errors,
      errorDetail: stats.errorDetail.length > 0 ? stats.errorDetail.join("\n") : null,
    });

    await pingHeartbeat(ok ? "success" : "failure",
      `sent=${stats.sent} errors=${stats.errors}\n${stats.errorDetail.join("\n")}`);

    if (!ok) await notifyOperatorOfFailures(stats);

    return stats;
  } catch (err) {
    // A thrown run is the worst case — nothing was sent and nothing else knows.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    await finishJobRun(runId, {
      ok: false,
      orgsProcessed: 0, sent: 0, skippedDuplicate: 0, skippedPattern: 0, errors: 1,
      errorDetail: `Run aborted — ${message}`,
    }).catch(() => { /* the throw below is more important than recording it */ });

    await pingHeartbeat("failure", `Run aborted — ${message}`);
    await notifyOperatorOfFailures({
      orgsProcessed: 0, sent: 0, skippedDuplicate: 0, skippedPattern: 0,
      errors: 1, errorDetail: [`Run aborted — ${message}`],
    }).catch(() => { /* ditto */ });

    throw err;
  }
}

async function runDailyCheckInternal(
  _trigger: "cron" | "manual",
  now: Date = new Date(),
): Promise<DailyCheckStats> {
  const stats: DailyCheckStats = {
    orgsProcessed: 0, sent: 0, skippedDuplicate: 0, skippedPattern: 0, errors: 0, errorDetail: [],
  };
  const orgIds = await listActiveOrgIds();

  // Hour-gating (org_settings.alertSendHour) is only SAFE when the cron runs
  // more often than the granularity it gates on — i.e. hourly. Vercel Hobby
  // caps cron to once per day, so if this were still `trigger === "manual"`,
  // any org whose configured hour doesn't match that one fixed daily instant
  // would never be checked again — not "delayed", *never* — for as long as
  // the plan stays Hobby. That is exactly the silent-alerter-death this app
  // exists to prevent, so it's unconditional until the cron is hourly again
  // (Vercel Pro, or the dormant Cloudflare cron-worker path). See docs/08 and
  // the "Alert send time" caveat on /settings.
  const ignoreSendHour = true;

  for (const orgId of orgIds) {
    // One tenant's failure must never abort the rest of the run. A transient
    // DB error reading this org's settings/candidates, or any other throw
    // inside the block, is recorded against this org and the loop moves on —
    // otherwise a single bad org silently costs every tenant after it in the
    // list their alerts for the day (and the run reads as one error, not N).
    try {
      await processOrg(orgId, now, stats, ignoreSendHour);
    } catch (err) {
      stats.errors++;
      recordError(stats, `Org ${orgId}: run failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return stats;
}

async function processOrg(orgId: string, now: Date, stats: DailyCheckStats, ignoreSendHour: boolean): Promise<void> {
    const settings = await getOrgSettings(orgId);
    const timezone = settings?.timezone ?? "Asia/Bangkok";

    // Hourly cron checks every active org each run; an org only actually sends
    // during its own send hour, in its own timezone. Other hours are a
    // deliberate no-op for it — the run still happened, which is what the
    // heartbeat/job_runs care about. `orgsProcessed` counts only orgs that were
    // actually due this run, so the admin panel doesn't read "N processed, 0
    // sent" every hour.
    if (!ignoreSendHour && !isSendHour(settings?.alertSendHour ?? 8, timezone, now)) return;
    stats.orgsProcessed++;

    const [candidates, contacts] = await Promise.all([
      listAlertCandidates(orgId),
      listContactsByOrg(orgId),
    ]);

    const thresholds = settings?.alertThresholds ?? [30, 15];
    const orgRecipients = settings?.alertRecipients ?? [];
    const productFilterRegex = settings?.productFilterRegex ?? null;
    const notifyCustomerContacts = settings?.notifyCustomerContacts ?? false;

    const contactsByCustomer = new Map<string, { email: string; notify: boolean }[]>();
    for (const c of contacts) {
      const list = contactsByCustomer.get(c.customerId) ?? [];
      list.push({ email: c.email, notify: c.notify });
      contactsByCustomer.set(c.customerId, list);
    }

    // Strictly one email per (customer, product) per run, mirroring
    // engine.py's `sent_customer_products` set — guards against duplicate
    // license rows for the same product (e.g. reissued across two files).
    const seenInRun = new Set<string>();

    for (const lic of candidates) {
      if (!matchesProductFilter(lic.productName, productFilterRegex)) {
        stats.skippedPattern++;
        continue;
      }

      const key = dedupKey(lic.customerId, lic.productName);
      if (seenInRun.has(key)) {
        stats.skippedDuplicate++;
        continue;
      }

      // listAlertCandidates already filters isNotNull(expireDate) at the DB
      // level; Drizzle's types don't reflect that, hence the assertions.
      const expireDate = lic.expireDate!;
      const remaining = daysRemaining(expireDate, timezone, now);
      const threshold = selectThreshold(remaining, thresholds);
      if (threshold === null) continue;

      const alreadySent = await hasAlertBeenSent(lic.id, threshold, expireDate);
      if (alreadySent) {
        seenInRun.add(key);
        continue;
      }

      const recipients = buildRecipients({
        orgRecipients,
        customerContacts: contactsByCustomer.get(lic.customerId) ?? [],
        notifyCustomerContacts,
      });
      if (recipients.length === 0) {
        // Recorded as a warning, not an error: nothing is broken, but an
        // expiring license produced no email, which from the customer's side
        // is indistinguishable from the system failing. It must be visible.
        // It doesn't fail the run, so a new org that hasn't configured
        // recipients yet doesn't page anyone at 1am.
        recordError(stats, `WARN ${lic.customerName} / ${lic.productName}: no valid recipients configured — no email sent`);
        continue;
      }

      const email = renderAlertEmail({
        customer: lic.customerName,
        soldTo: lic.soldTo,
        version: lic.version,
        product: lic.productName,
        expireDate,
        daysRemaining: remaining!,
      });

      const result = await sendEmail({ to: recipients, subject: email.subject, text: email.text, html: email.html });

      if (!result.ok) {
        stats.errors++;
        recordError(stats,
          `${lic.customerName} / ${lic.productName} -> ${recipients.join(", ")}: ${result.error ?? "send failed"}`);
        continue;
      }

      seenInRun.add(key);
      stats.sent++;

      // Send first, log second (D7 / docs/01 §3.2) — a crash between the two
      // produces a duplicate email on the next run rather than a silently
      // missed expiry. Never invert this.
      try {
        await recordAlert({
          organizationId: orgId,
          licenseId: lic.id,
          thresholdDays: threshold,
          expireDate,
          recipients,
          providerMessageId: result.providerMessageId,
        });
      } catch (err) {
        // A concurrent run — the scheduled cron overlapping a manual "Run
        // check now", or a Vercel retry of a timed-out invocation — can send
        // the same alert and win the race to the uq_alert_dedup row. The email
        // has already gone out (counted above), so losing that race is the
        // expected, benign outcome, not a run failure: swallow it. Any other
        // write failure is real — the alert was sent but not recorded, so the
        // next run will resend it — and must be surfaced.
        if (!isUniqueViolation(err, "uq_alert_dedup")) {
          stats.errors++;
          recordError(stats,
            `${lic.customerName} / ${lic.productName}: alert sent but not logged — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
}

function recordError(stats: DailyCheckStats, message: string) {
  if (stats.errorDetail.length < MAX_RECORDED_ERRORS) stats.errorDetail.push(message);
  else if (stats.errorDetail.length === MAX_RECORDED_ERRORS) stats.errorDetail.push("… further errors omitted");
}
