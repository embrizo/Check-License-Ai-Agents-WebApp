"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import {
  createCertificateAction, updateCertificateAction, deleteCertificateAction,
  suggestCertificateFromPdf, type CertSuggestion,
} from "./actions";
import {
  CERT_TYPE_PRESETS, computeExpiry, findPreset, isValidDateString,
  type CertCategory,
} from "@/server/domain/certificates";
import { useI18n } from "@/i18n/provider";
import { tf } from "@/i18n/dictionaries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface CertInitial {
  category: CertCategory;
  certType: string;
  holderName: string | null;
  certNumber: string | null;
  issueDate: string;
  expireDate: string;
  renewalMonths: number;
  notes: string | null;
  customerId: string | null;
}

type CustomerOption = { id: string; name: string };

const EMPTY: CertInitial = {
  category: "personal",
  certType: "",
  holderName: "",
  certNumber: "",
  issueDate: "",
  expireDate: "",
  renewalMonths: 60,
  notes: "",
  customerId: null,
};

/**
 * Shared fields for create + edit. Controlled so the renewal cycle and expiry
 * can auto-fill. Expiry is recomputed from issue + cycle in the field change
 * handlers (never an effect — the project's lint forbids setState-in-effect, and
 * this is the "you might not need an effect" case), and stops auto-filling once
 * the user types their own expiry. All values submit via `name`d inputs, with
 * hidden mirrors for the Select-driven fields so they reach FormData.
 */
function CertFields({ initial, customers }: { initial: CertInitial; customers: CustomerOption[] }) {
  const { dict } = useI18n();
  const d = dict.certificates;
  const [category, setCategory] = useState<CertCategory>(initial.category);
  const [certType, setCertType] = useState(initial.certType);
  const [holderName, setHolderName] = useState(initial.holderName ?? "");
  const [certNumber, setCertNumber] = useState(initial.certNumber ?? "");
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [renewalMonths, setRenewalMonths] = useState(String(initial.renewalMonths));
  const [expireDate, setExpireDate] = useState(initial.expireDate);
  const [expiryManual, setExpiryManual] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [suggesting, startSuggest] = useTransition();
  const [suggestMsg, setSuggestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function autoExpiry(nextIssue: string, nextMonths: string) {
    if (expiryManual) return;
    const months = Number(nextMonths);
    if (isValidDateString(nextIssue) && Number.isInteger(months) && months > 0) {
      setExpireDate(computeExpiry(nextIssue, months));
    }
  }

  function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after an edit
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setSuggestMsg(null);
    startSuggest(async () => {
      const res = await suggestCertificateFromPdf(fd);
      if (!res.ok) { setSuggestMsg({ ok: false, text: res.error }); return; }
      applySuggestion(res.suggestion, file.name);
    });
  }

  // Pre-fill from an AI reading. Only fields the model actually returned are
  // touched, and a matching preset wins for cycle/category (canonical over the
  // model's guess). The user still reviews and can overwrite every field.
  function applySuggestion(s: CertSuggestion, fileName: string) {
    let months: number | null = s.renewalMonths;
    let nextCategory: CertCategory | null = s.category;

    if (s.certType) {
      setCertType(s.certType);
      const preset = findPreset(s.certType);
      if (preset) { months = preset.renewalMonths; nextCategory = preset.category; }
    }
    if (nextCategory) setCategory(nextCategory);
    if (months != null) setRenewalMonths(String(months));
    if (s.holderName) setHolderName(s.holderName);
    if (s.certNumber) setCertNumber(s.certNumber);
    if (s.issueDate) setIssueDate(s.issueDate);

    if (s.expireDate) {
      setExpireDate(s.expireDate);
      setExpiryManual(true); // the printed expiry is authoritative; don't recompute over it
    } else if (s.issueDate && months != null && months > 0 && isValidDateString(s.issueDate)) {
      setExpireDate(computeExpiry(s.issueDate, months));
    }

    setSuggestMsg({ ok: true, text: tf(d.suggestFilled, { file: fileName }) });
  }

  function onPickType(value: string) {
    setCertType(value);
    const preset = findPreset(value);
    if (preset) {
      setRenewalMonths(String(preset.renewalMonths));
      setCategory(preset.category);
      autoExpiry(issueDate, String(preset.renewalMonths));
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* hidden mirrors for Select-driven values */}
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="customerId" value={customerId} />

      {/* PDF auto-fill — reads the certificate and pre-fills the fields below */}
      <div className="flex flex-col gap-1 rounded-md border border-dashed bg-muted/30 p-3 sm:col-span-2">
        <Label>{d.suggestLabel}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {/* unnamed: not part of the submitted cert FormData */}
          <input
            ref={fileRef} type="file" accept="application/pdf"
            className="hidden" onChange={onPickPdf}
          />
          <Button
            type="button" variant="outline" size="sm" disabled={suggesting}
            onClick={() => fileRef.current?.click()}
          >
            {suggesting ? d.suggestReading : d.suggestChoose}
          </Button>
          {suggestMsg && (
            <span className={cn("text-xs", suggestMsg.ok ? "text-muted-foreground" : "text-destructive")}>
              {suggestMsg.text}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{d.suggestHint}</p>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{d.fCategory}</Label>
        <Select value={category} onValueChange={(v) => v && setCategory(v as CertCategory)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">{d.categoryPersonal}</SelectItem>
            <SelectItem value="inspection">{d.categoryInspection}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="certType">{d.fType}</Label>
        <Input
          id="certType" name="certType" list="cert-type-presets" required
          value={certType} onChange={(e) => onPickType(e.target.value)}
          placeholder={d.fTypePlaceholder}
        />
        <datalist id="cert-type-presets">
          {CERT_TYPE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.labelEn}</option>
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="holderName">{d.fHolder} {category === "personal" && <span className="text-destructive">*</span>}</Label>
        <Input
          id="holderName" name="holderName"
          value={holderName} onChange={(e) => setHolderName(e.target.value)}
          placeholder={category === "inspection" ? d.fHolderNone : d.fHolderPlaceholder}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>{d.fSite}</Label>
        <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : (v ?? ""))}>
          <SelectTrigger><SelectValue placeholder={d.fSiteNone} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{d.fSiteNone}</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="issueDate">{d.fIssueDate} <span className="text-destructive">*</span></Label>
        <Input id="issueDate" name="issueDate" type="date" required
          value={issueDate}
          onChange={(e) => { setIssueDate(e.target.value); autoExpiry(e.target.value, renewalMonths); }} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="renewalMonths">{d.fRenewal}</Label>
        <Input id="renewalMonths" name="renewalMonths" type="number" min={1} max={600} required
          value={renewalMonths}
          onChange={(e) => { setRenewalMonths(e.target.value); autoExpiry(issueDate, e.target.value); }} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="expireDate">{d.fExpiry} <span className="text-destructive">*</span></Label>
        <Input id="expireDate" name="expireDate" type="date" required
          value={expireDate}
          onChange={(e) => { setExpireDate(e.target.value); setExpiryManual(true); }} />
        <p className="text-xs text-muted-foreground">{d.fExpiryHint}</p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="certNumber">{d.fCertNo}</Label>
        <Input id="certNumber" name="certNumber"
          value={certNumber} onChange={(e) => setCertNumber(e.target.value)}
          placeholder="69252-023" />
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label htmlFor="notes">{d.fNotes}</Label>
        <Input id="notes" name="notes" defaultValue={initial.notes ?? ""} placeholder={d.fNotesPlaceholder} />
      </div>
    </div>
  );
}

export function CreateCertificateCard({ customers }: { customers: CustomerOption[] }) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [formKey, setFormKey] = useState(0); // bump to remount (reset) the fields
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCertificateAction(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      setError(undefined);
      setFormKey((k) => k + 1);
      router.refresh();
    });
  }

  if (!open) {
    return <Button type="button" onClick={() => setOpen(true)}>{dict.certificates.add}</Button>;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <CertFields key={formKey} initial={EMPTY} customers={customers} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? dict.common.saving : dict.common.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{dict.common.close}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function EditCertificateButton({
  certId, initial, customers,
}: { certId: string; initial: CertInitial; customers: CustomerOption[] }) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateCertificateAction(certId, undefined, fd);
      if (res?.error) { setError(res.error); return; }
      setError(undefined);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{dict.common.edit}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dict.certificates.editTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <CertFields initial={initial} customers={customers} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? dict.common.saving : dict.common.save}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{dict.common.cancel}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteCertificateButton({ certId, label }: { certId: string; label: string }) {
  const { dict } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function del() {
    startTransition(async () => {
      const ok = await runAction(() => deleteCertificateAction(certId), `${dict.common.deleted}: ${label}`);
      if (ok) router.refresh();
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}>{dict.common.delete}</Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{dict.certificates.deleteConfirm}</span>
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={del}>
        {pending ? dict.common.deleting : dict.common.yes}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        {dict.common.no}
      </Button>
    </span>
  );
}
