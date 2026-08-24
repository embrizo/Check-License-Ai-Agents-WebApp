"use client";

import { useState, useTransition } from "react";
import { runAction } from "@/lib/run-action";
import { deleteLicenseAction } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Per-row license delete. Two-step inline confirm rather than a modal — deleting
 * is destructive (it can remove a confirmed row and cascades its alert history),
 * so a single stray click shouldn't do it, but a modal per row is overkill.
 */
export function DeleteLicenseButton({ licenseId, productName }: { licenseId: string; productName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function del() {
    startTransition(async () => {
      const ok = await runAction(() => deleteLicenseAction(licenseId), `Deleted "${productName}".`);
      // On failure the row is still there — drop back to the idle button so the
      // toast's advice ("refresh and try again") isn't stuck behind a Cancel.
      if (!ok) setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">Delete?</span>
      <Button type="button" size="xs" variant="destructive" disabled={pending} onClick={del}>
        {pending ? "Deleting…" : "Yes"}
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        No
      </Button>
    </span>
  );
}
