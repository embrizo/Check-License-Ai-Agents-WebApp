"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { draftRenewalAction, sendRenewalEmailAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function RenewalDraftDialog({ licenseId, defaultTo }: { licenseId: string; defaultTo: string }) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<"formal" | "friendly">("formal");
  const [language, setLanguage] = useState<"English" | "Thai">("English");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState(defaultTo);
  const [drafting, startDrafting] = useTransition();
  const [sending, startSending] = useTransition();

  function generate() {
    startDrafting(async () => {
      const result = await draftRenewalAction(licenseId, tone, language);
      if (result.ok) {
        setSubject(result.subject);
        setBody(result.body);
      } else {
        toast.error(result.error);
      }
    });
  }

  function send() {
    startSending(async () => {
      const result = await sendRenewalEmailAction(licenseId, { to, subject, body });
      if (result.ok) {
        toast.success("Renewal email sent.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
        Draft renewal email
      </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft a renewal email</DialogTitle>
          <DialogDescription>AI drafts it — you review and send. Nothing goes out automatically.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => v && setTone(v as "formal" | "friendly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>Language</Label>
              <Select value={language} onValueChange={(v) => v && setLanguage(v as "English" | "Thai")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Thai">Thai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={generate} disabled={drafting}>
            {drafting ? "Drafting…" : subject ? "Regenerate draft" : "Generate draft"}
          </Button>

          {subject && (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="renewal-to">To</Label>
                <Input id="renewal-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="renewal-subject">Subject</Label>
                <Input id="renewal-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="renewal-body">Body</Label>
                <textarea
                  id="renewal-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={send} disabled={!subject || sending || !to.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
