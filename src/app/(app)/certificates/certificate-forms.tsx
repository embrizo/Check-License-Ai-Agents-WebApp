"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAction } from "@/lib/run-action";
import {
  createCertificateAction, updateCertificateAction, deleteCertificateAction,
} from "./actions";
import {
  CERT_TYPE_PRESETS, computeExpiry, findPreset, isValidDateString,
  type CertCategory,
} from "@/server/domain/certificates";
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
  const [category, setCategory] = useState<CertCategory>(initial.category);
  const [certType, setCertType] = useState(initial.certType);
  const [holderName, setHolderName] = useState(initial.holderName ?? "");
  const [certNumber, setCertNumber] = useState(initial.certNumber ?? "");
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [renewalMonths, setRenewalMonths] = useState(String(initial.renewalMonths));
  const [expireDate, setExpireDate] = useState(initial.expireDate);
  const [expiryManual, setExpiryManual] = useState(false);

  function autoExpiry(nextIssue: string, nextMonths: string) {
    if (expiryManual) return;
    const months = Number(nextMonths);
    if (isValidDateString(nextIssue) && Number.isInteger(months) && months > 0) {
      setExpireDate(computeExpiry(nextIssue, months));
    }
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

      <div className="flex flex-col gap-1">
        <Label>Category / ประเภท</Label>
        <Select value={category} onValueChange={(v) => v && setCategory(v as CertCategory)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Personal — เซอร์ส่วนบุคคล</SelectItem>
            <SelectItem value="inspection">Inspection — ตรวจ/ประจำปี</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="certType">Certificate type / ชนิดเซอร์</Label>
        <Input
          id="certType" name="certType" list="cert-type-presets" required
          value={certType} onChange={(e) => onPickType(e.target.value)}
          placeholder="เช่น ที่อับอากาศ"
        />
        <datalist id="cert-type-presets">
          {CERT_TYPE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.labelEn}</option>
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="holderName">Holder / ชื่อผู้ถือ {category === "personal" && <span className="text-destructive">*</span>}</Label>
        <Input
          id="holderName" name="holderName"
          value={holderName} onChange={(e) => setHolderName(e.target.value)}
          placeholder={category === "inspection" ? "— ไม่ระบุ —" : "ชื่อพนักงาน"}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label>Site / ไซต์ (optional)</Label>
        <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : (v ?? ""))}>
          <SelectTrigger><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— ไม่ระบุ —</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="issueDate">Issue date / วันออก <span className="text-destructive">*</span></Label>
        <Input id="issueDate" name="issueDate" type="date" required
          value={issueDate}
          onChange={(e) => { setIssueDate(e.target.value); autoExpiry(e.target.value, renewalMonths); }} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="renewalMonths">Renewal cycle (months) / รอบต่ออายุ</Label>
        <Input id="renewalMonths" name="renewalMonths" type="number" min={1} max={600} required
          value={renewalMonths}
          onChange={(e) => { setRenewalMonths(e.target.value); autoExpiry(issueDate, e.target.value); }} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="expireDate">Expiry date / วันหมดอายุ <span className="text-destructive">*</span></Label>
        <Input id="expireDate" name="expireDate" type="date" required
          value={expireDate}
          onChange={(e) => { setExpireDate(e.target.value); setExpiryManual(true); }} />
        <p className="text-xs text-muted-foreground">คำนวณอัตโนมัติจากวันออก + รอบ — แก้ไขได้</p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="certNumber">Certificate no. / เลขทะเบียน</Label>
        <Input id="certNumber" name="certNumber"
          value={certNumber} onChange={(e) => setCertNumber(e.target.value)}
          placeholder="เช่น 69252-023" />
      </div>

      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label htmlFor="notes">Notes / หมายเหตุ</Label>
        <Input id="notes" name="notes" defaultValue={initial.notes ?? ""} placeholder="optional" />
      </div>
    </div>
  );
}

export function CreateCertificateCard({ customers }: { customers: CustomerOption[] }) {
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
    return <Button type="button" onClick={() => setOpen(true)}>+ เพิ่มใบเซอร์</Button>;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <CertFields key={formKey} initial={EMPTY} customers={customers} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ปิด</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function EditCertificateButton({
  certId, initial, customers,
}: { certId: string; initial: CertInitial; customers: CustomerOption[] }) {
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Edit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>แก้ไขใบเซอร์</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <CertFields initial={initial} customers={customers} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteCertificateButton({ certId, label }: { certId: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function del() {
    startTransition(async () => {
      const ok = await runAction(() => deleteCertificateAction(certId), `ลบ "${label}" แล้ว`);
      if (ok) router.refresh();
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}>Delete</Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-muted-foreground">ลบ?</span>
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={del}>
        {pending ? "กำลังลบ…" : "ใช่"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        ไม่
      </Button>
    </span>
  );
}
