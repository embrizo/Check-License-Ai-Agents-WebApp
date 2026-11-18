import Link from "next/link";
import { requireOrg } from "@/server/auth/guards";
import { listCertificatesWithCustomer } from "@/server/data/certificates";
import { listCustomers } from "@/server/data/customers";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor, type ExpiryBucket } from "@/server/domain/thresholds";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CreateCertificateCard, EditCertificateButton, DeleteCertificateButton, type CertInitial,
} from "./certificate-forms";

const BADGE_VARIANT: Record<ExpiryBucket, "default" | "secondary" | "destructive" | "outline"> = {
  expired: "destructive",
  critical: "destructive",
  warning: "secondary",
  ok: "default",
  perpetual: "outline",
};

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { dict } = await getI18n();
  const d = dict.certificates;
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

  const filters: { key: string; label: string }[] = [
    { key: "all", label: d.filterAll },
    { key: "expired", label: dict.buckets.expired },
    { key: "critical", label: dict.buckets.critical },
    { key: "warning", label: dict.buckets.warning },
    { key: "ok", label: dict.buckets.ok },
    { key: "personal", label: d.filterPersonal },
    { key: "inspection", label: d.filterInspection },
  ];

  function remainingLabel(remaining: number | null): string {
    if (remaining === null) return "—";
    if (remaining < 0) return tf(d.remainingOver, { n: Math.abs(remaining) });
    if (remaining === 0) return d.remainingToday;
    return tf(d.remainingLeft, { n: remaining });
  }

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
          <h1 className="text-xl font-semibold">{d.title}</h1>
          <p className="text-sm text-muted-foreground">{d.subtitle}</p>
        </div>
        <span className="text-sm text-muted-foreground">{rows.length} / {allRows.length}</span>
      </div>

      <CreateCertificateCard customers={customerOptions} />

      <form className="flex flex-wrap items-center gap-2" action="/certificates">
        <input
          name="q" defaultValue={params.q ?? ""} placeholder={d.searchPlaceholder}
          className="h-9 max-w-xs flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
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
              <TableHead>{d.colType}</TableHead>
              <TableHead>{d.colHolder}</TableHead>
              <TableHead>{d.colSite}</TableHead>
              <TableHead>{d.colIssued}</TableHead>
              <TableHead>{d.colExpires}</TableHead>
              <TableHead>{d.colStatus}</TableHead>
              <TableHead>{d.colCertNo}</TableHead>
              <TableHead>{d.colActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {d.empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
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
                        {r.category === "personal" ? d.categoryPersonal : d.categoryInspection} · {tf(d.everyMonths, { n: r.renewalMonths })}
                      </div>
                    </TableCell>
                    <TableCell>{r.holderName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.issueDate}</TableCell>
                    <TableCell>
                      {r.expireDate}
                      <div className="text-xs text-muted-foreground">{remainingLabel(r.remaining)}</div>
                    </TableCell>
                    <TableCell><Badge variant={BADGE_VARIANT[r.bucket]}>{dict.buckets[r.bucket]}</Badge></TableCell>
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
