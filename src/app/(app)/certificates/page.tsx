import Link from "next/link";
import { requireOrg } from "@/server/auth/guards";
import { listCertificatesWithCustomer } from "@/server/data/certificates";
import { listCustomers } from "@/server/data/customers";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor, type ExpiryBucket } from "@/server/domain/thresholds";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CreateCertificateCard, EditCertificateButton, DeleteCertificateButton, type CertInitial,
} from "./certificate-forms";

const BUCKET_BADGE: Record<ExpiryBucket, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  expired: { label: "หมดอายุ", variant: "destructive" },
  critical: { label: "≤ 15 วัน", variant: "destructive" },
  warning: { label: "≤ 30 วัน", variant: "secondary" },
  ok: { label: "ปกติ", variant: "default" },
  perpetual: { label: "—", variant: "outline" },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "expired", label: "หมดอายุ" },
  { key: "critical", label: "≤ 15 วัน" },
  { key: "warning", label: "≤ 30 วัน" },
  { key: "ok", label: "ปกติ" },
  { key: "personal", label: "ส่วนบุคคล" },
  { key: "inspection", label: "ตรวจ/ประจำปี" },
];

function remainingLabel(remaining: number | null): string {
  if (remaining === null) return "—";
  if (remaining < 0) return `เลยมา ${Math.abs(remaining)} วัน`;
  if (remaining === 0) return "วันนี้";
  return `อีก ${remaining} วัน`;
}

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { orgId } = await requireOrg();
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const filter = params.filter ?? "all";

  const [settings, certs, customers] = await Promise.all([
    getOrgSettings(orgId),
    listCertificatesWithCustomer(orgId),
    listCustomers(orgId),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";
  const customerOptions = customers.map((c) => ({ id: c.id, name: c.name }));

  const allRows = certs
    .map((c) => {
      const remaining = daysRemaining(c.expireDate, timezone);
      return { ...c, remaining, bucket: bucketFor(remaining) };
    })
    .sort((a, b) => (a.remaining ?? Infinity) - (b.remaining ?? Infinity));

  const counts: Record<string, number> = {
    all: allRows.length,
    personal: allRows.filter((r) => r.category === "personal").length,
    inspection: allRows.filter((r) => r.category === "inspection").length,
  };
  for (const r of allRows) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;

  let rows = allRows;
  if (q) {
    rows = rows.filter((r) =>
      r.certType.toLowerCase().includes(q) ||
      (r.holderName ?? "").toLowerCase().includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q) ||
      (r.certNumber ?? "").toLowerCase().includes(q));
  }
  if (filter === "personal" || filter === "inspection") {
    rows = rows.filter((r) => r.category === filter);
  } else if (filter !== "all") {
    rows = rows.filter((r) => r.bucket === filter);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">ใบเซอร์ / Certificates</h1>
          <p className="text-sm text-muted-foreground">
            ติดตามวันหมดอายุเซอร์อบรมและการตรวจประจำปี — แจ้งเตือนล่วงหน้าเหมือน licenses
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{rows.length} of {allRows.length}</span>
      </div>

      <CreateCertificateCard customers={customerOptions} />

      <form className="flex flex-wrap items-center gap-2" action="/certificates">
        <input
          name="q" defaultValue={params.q ?? ""} placeholder="ค้นหา ชนิด/ชื่อ/ไซต์/เลขทะเบียน…"
          className="h-9 max-w-xs flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/certificates?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.key !== "all" ? { filter: f.key } : {}) }).toString()}`}
            >
              <Badge variant={filter === f.key ? "default" : "outline"} className="cursor-pointer">
                {f.label} {counts[f.key] !== undefined ? `(${counts[f.key]})` : ""}
              </Badge>
            </Link>
          ))}
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชนิด</TableHead>
              <TableHead>ผู้ถือ</TableHead>
              <TableHead>ไซต์</TableHead>
              <TableHead>วันออก</TableHead>
              <TableHead>วันหมดอายุ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>เลขทะเบียน</TableHead>
              <TableHead>จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  ยังไม่มีใบเซอร์ — กด “เพิ่มใบเซอร์” ด้านบน
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const badge = BUCKET_BADGE[r.bucket];
                const initial: CertInitial = {
                  category: r.category,
                  certType: r.certType,
                  holderName: r.holderName,
                  certNumber: r.certNumber,
                  issueDate: r.issueDate,
                  expireDate: r.expireDate,
                  renewalMonths: r.renewalMonths,
                  notes: r.notes,
                  customerId: r.customerId,
                };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.certType}
                      <div className="text-xs text-muted-foreground">
                        {r.category === "personal" ? "ส่วนบุคคล" : "ตรวจ/ประจำปี"} · ทุก {r.renewalMonths} เดือน
                      </div>
                    </TableCell>
                    <TableCell>{r.holderName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.issueDate}</TableCell>
                    <TableCell>
                      {r.expireDate}
                      <div className="text-xs text-muted-foreground">{remainingLabel(r.remaining)}</div>
                    </TableCell>
                    <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.certNumber ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EditCertificateButton certId={r.id} initial={initial} customers={customerOptions} />
                        <DeleteCertificateButton certId={r.id} label={`${r.certType}${r.holderName ? ` — ${r.holderName}` : ""}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
