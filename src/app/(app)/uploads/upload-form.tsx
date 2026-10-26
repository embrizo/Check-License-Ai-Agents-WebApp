"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadLicenseFiles, quickCreateCustomer, tryAiParseAction, type UploadState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  parsed: { label: "Parsed", variant: "default" },
  unchanged: { label: "Unchanged", variant: "secondary" },
  unrecognised: { label: "Unrecognised", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
};

function TryAiParseButton({ licenseFileId }: { licenseFileId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const result = await tryAiParseAction(licenseFileId);
      if (result.ok) {
        setDone(true);
        const skipped = result.skippedConfirmed > 0
          ? ` ${result.skippedConfirmed} already confirmed and left untouched.`
          : "";
        toast.success(
          result.upserted > 0
            ? `AI found ${result.upserted} license(s) — pending review on the Licenses page.${skipped}`
            : result.skippedConfirmed > 0
              ? `Nothing new — all ${result.skippedConfirmed} license(s) in this file are already confirmed.`
              : "AI parse ran but found no license entitlements either.",
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  if (done) return <span className="text-xs text-muted-foreground">AI parse complete — see Licenses</span>;

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "Asking AI…" : "Try AI parse"}
    </Button>
  );
}

export function UploadForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadLicenseFiles, undefined);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [isCreating, startCreating] = useTransition();
  const router = useRouter();

  function handleAddCustomer() {
    const name = newCustomerName.trim();
    if (!name) return;
    startCreating(async () => {
      try {
        const result = await quickCreateCustomer(name);
        if (result.ok) {
          setCustomerId(result.id);
          setNewCustomerName("");
          toast.success(`Customer "${result.name}" created.`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Couldn't create customer — please refresh and try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label>Customer</Label>
            {customers.length > 0 ? (
              <Select value={customerId} onValueChange={(value) => setCustomerId(value ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No customers yet — add one below.</p>
            )}
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="New customer name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomer(); } }}
              />
              <Button type="button" variant="outline" onClick={handleAddCustomer} disabled={isCreating || !newCustomerName.trim()}>
                Add
              </Button>
            </div>
          </div>

          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="customerId" value={customerId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="files">Files</Label>
              <Input id="files" name="files" type="file" multiple required accept=".lic,.txt,.dat,.log,.pdf,.bin" />
              <p className="text-xs text-muted-foreground">
                FlexLM files (.lic/.txt/.dat/.log) and FlexNet capability responses (.bin) parse
                automatically. PDFs (e.g. subscription renewal confirmations) are read as text, then
                use <span className="font-medium">Try AI parse</span> to extract the licenses for review.
              </p>
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending || !customerId} className="w-fit">
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state?.results && state.results.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <ul className="space-y-2">
              {state.results.map((r, i) => {
                const meta = STATUS_LABEL[r.status];
                return (
                  <li key={`${r.filename}-${i}`} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{r.filename}</div>
                      <div className="text-sm text-muted-foreground">
                        {r.status === "parsed" && `${r.upserted} license(s) upserted${r.staleDeleted ? `, ${r.staleDeleted} stale removed` : ""}`}
                        {r.status === "unchanged" && "File content hasn't changed since last upload."}
                        {(r.status === "unrecognised" || r.status === "error") && r.message}
                      </div>
                      {r.status === "unrecognised" && (
                        <div className="mt-2">
                          <TryAiParseButton licenseFileId={r.licenseFileId} />
                        </div>
                      )}
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
