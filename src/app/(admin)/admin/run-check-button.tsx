"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { runCheckNowAction } from "./actions";
import { Button } from "@/components/ui/button";
import type { DailyCheckStats } from "@/server/jobs/dailyCheck";

export function RunCheckButton() {
  const [pending, startTransition] = useTransition();
  const [stats, setStats] = useState<DailyCheckStats | null>(null);

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await runCheckNowAction();
        setStats(result);
        toast.success(`Checked ${result.orgsProcessed} org(s), sent ${result.sent} alert(s).`);
      } catch {
        toast.error("Check failed — see server logs.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? "Running…" : "Run check now"}
      </Button>
      {stats && (
        <span className="text-sm text-muted-foreground">
          orgs={stats.orgsProcessed} sent={stats.sent} dup={stats.skippedDuplicate} filtered={stats.skippedPattern} errors={stats.errors}
        </span>
      )}
    </div>
  );
}
