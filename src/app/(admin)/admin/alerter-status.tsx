import { jobHealth, needsAttention, describeHealth, STALE_AFTER_HOURS } from "@/server/domain/jobHealth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Run {
  id: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  orgsProcessed: number;
  sent: number;
  errors: number;
  errorDetail: string | null;
}

const BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ok: "default",
  running: "secondary",
  errors: "destructive",
  stale: "destructive",
  never: "destructive",
};

function when(date: Date, now: Date): string {
  const mins = Math.round((now.getTime() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The answer to "is the thing we sell actually working?", on the first screen
 * an operator sees. Everything else in this console is about configuring the
 * product; this is the only panel that says whether it's running.
 */
export function AlerterStatus({ lastRun, recent }: { lastRun: Run | null; recent: Run[] }) {
  const now = new Date();
  const health = jobHealth(lastRun, now);
  const attention = needsAttention(health);

  return (
    <Card className={attention ? "border-destructive" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Alert checks</CardTitle>
          <Badge variant={BADGE[health] ?? "secondary"}>{health}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={attention ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
          {describeHealth(health)}
        </p>

        {lastRun ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Last run</dt>
              <dd>{when(lastRun.startedAt, now)} <span className="text-muted-foreground">({lastRun.trigger})</span></dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Emails sent</dt>
              <dd>{lastRun.sent}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Orgs processed</dt>
              <dd>{lastRun.orgsProcessed}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Errors</dt>
              <dd className={lastRun.errors > 0 ? "font-medium text-destructive" : undefined}>{lastRun.errors}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Use “Run check now” to confirm the pipeline works,
            then verify the scheduled run fires tomorrow.
          </p>
        )}

        {lastRun?.errorDetail && (
          <details className="rounded-md border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">What failed</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{lastRun.errorDetail}</pre>
          </details>
        )}

        {recent.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Recent runs</summary>
            <ul className="mt-2 space-y-1">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  <span>{r.trigger}</span>
                  <span>{r.finishedAt ? (r.ok ? "ok" : "failed") : "unfinished"}</span>
                  <span>sent {r.sent}</span>
                  {r.errors > 0 && <span className="text-destructive">errors {r.errors}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-muted-foreground">
          Considered stale after {STALE_AFTER_HOURS}h without a completed run. An external
          uptime check on <code>/api/health</code> is what catches this when nobody is looking.
        </p>
      </CardContent>
    </Card>
  );
}
