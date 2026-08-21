/**
 * Standalone cron Worker for the daily license-expiry check.
 *
 * Deliberately tiny and separate from the Next.js app Worker: it does no work
 * itself, it just pokes the app's already-tested, bearer-authenticated
 * /api/cron/daily route on a schedule — the exact contract Vercel Cron used.
 * Keeping it separate means a cron misfire can never take down the web app,
 * and the app needs no OpenNext-worker wrapping to gain a scheduled() handler.
 *
 * If the daily run ever grows heavy enough to approach the ~30s request CPU
 * limit, move the work into a scheduled() handler that runs the job directly
 * (>=1h-interval crons get up to 15min CPU) instead of over HTTP.
 */
interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(`${env.APP_URL}/api/cron/daily`, {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      })
        .then(async (res) => {
          if (!res.ok) {
            // The heartbeat + ops-alert inside the app are the real alarms; this
            // log is just breadcrumbs in `wrangler tail` when triaging.
            console.error(`[cron] /api/cron/daily -> ${res.status}: ${await res.text()}`);
          }
        })
        .catch((err) => {
          console.error("[cron] request failed", err);
        }),
    );
  },
} satisfies ExportedHandler<Env>;
