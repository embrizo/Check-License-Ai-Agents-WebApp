"use client";

import { useTransition } from "react";
import { runAction } from "@/lib/run-action";
import { confirmLicenseAction, rejectLicenseAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * docs/05 §2: below this, the row is flagged prominently rather than shown as
 * an ordinary suggestion. A tooltip doesn't qualify — it's invisible until
 * hover and unreachable entirely on touch — and a reviewer who can't tell a
 * 0.30 guess from a 0.95 one will confirm both, which is precisely how a
 * hallucinated expiry date becomes an alert-eligible license.
 */
const LOW_CONFIDENCE = 0.7;

/** Shown only for AI-parsed, unreviewed rows — confirmed/manual rows render nothing here. */
export function ReviewCell({ licenseId, confidence }: { licenseId: string; confidence: number | null }) {
  const [pending, startTransition] = useTransition();
  const percent = confidence != null ? Math.round(confidence * 100) : null;
  const lowConfidence = confidence != null && confidence < LOW_CONFIDENCE;

  function confirm() {
    startTransition(async () => {
      await runAction(
        () => confirmLicenseAction(licenseId),
        "Confirmed — will now be included in alert checks.",
      );
    });
  }

  function reject() {
    startTransition(async () => {
      await runAction(() => rejectLicenseAction(licenseId), "AI guess removed.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={lowConfidence ? "destructive" : "secondary"}>
        {lowConfidence ? "AI · low confidence" : "AI · pending review"}
        {percent != null && ` · ${percent}%`}
      </Badge>
      {lowConfidence && (
        <span className="w-full text-xs text-destructive sm:w-auto">
          Check this against the file before confirming.
        </span>
      )}
      <Button type="button" size="xs" variant="outline" disabled={pending} onClick={confirm}>Confirm</Button>
      <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={reject}>Reject</Button>
    </div>
  );
}
