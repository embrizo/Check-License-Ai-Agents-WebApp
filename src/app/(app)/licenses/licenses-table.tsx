"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ExpiryBucket } from "@/server/domain/thresholds";
import { formatSeats } from "@/server/domain/seats";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ReviewCell } from "./review-cell";

export type LicenseRow = {
  id: string;
  productName: string;
  customerId: string;
  customerName: string;
  vendor: string | null;
  version: string | null;
  expireDate: string | null;
  seats: number | null;
  bucket: ExpiryBucket;
  reviewState: string;
  confidence: number | null;
};

export const BUCKET_BADGE: Record<ExpiryBucket, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  expired: { label: "Expired", variant: "destructive" },
  critical: { label: "≤ 15 days", variant: "destructive" },
  warning: { label: "≤ 30 days", variant: "secondary" },
  ok: { label: "Healthy", variant: "default" },
  perpetual: { label: "Perpetual", variant: "outline" },
};

// Lower = more urgent; used to pick the "worst" badge for a collapsed customer group.
const BUCKET_SEVERITY: Record<ExpiryBucket, number> = {
  expired: 0, critical: 1, warning: 2, ok: 3, perpetual: 4,
};

function LicenseDetailRow({ r, indent }: { r: LicenseRow; indent: boolean }) {
  const badge = BUCKET_BADGE[r.bucket];
  return (
    <TableRow>
      <TableCell className={indent ? "pl-8 font-medium" : "font-medium"}>
        <Link href={`/customers/${r.customerId}`} className="hover:underline">
          {r.productName}
        </Link>
      </TableCell>
      <TableCell>{indent ? null : r.customerName}</TableCell>
      <TableCell className="text-muted-foreground">{r.vendor ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{r.version ?? "—"}</TableCell>
      <TableCell>{r.expireDate ?? "—"}</TableCell>
      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
      <TableCell>{formatSeats(r.seats)}</TableCell>
      <TableCell>
        {r.reviewState === "pending_review" && (
          <ReviewCell licenseId={r.id} confidence={r.confidence} />
        )}
      </TableCell>
    </TableRow>
  );
}

function CustomerGroup({ customerId, customerName, rows }: { customerId: string; customerName: string; rows: LicenseRow[] }) {
  const [open, setOpen] = useState(false);

  if (rows.length === 1) return <LicenseDetailRow r={rows[0]} indent={false} />;

  const worst = rows.reduce((a, b) => (BUCKET_SEVERITY[b.bucket] < BUCKET_SEVERITY[a.bucket] ? b : a));
  const badge = BUCKET_BADGE[worst.bucket];

  return (
    <>
      <TableRow className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => setOpen((v) => !v)}>
        <TableCell colSpan={4} className="font-medium">
          <span className="inline-flex items-center gap-1.5">
            {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <Link href={`/customers/${customerId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {customerName}
            </Link>
            <Badge variant="outline">{rows.length} licenses</Badge>
          </span>
        </TableCell>
        <TableCell colSpan={2}>
          <Badge variant={badge.variant}>{badge.label}{rows.length > 1 ? " (worst)" : ""}</Badge>
        </TableCell>
        <TableCell colSpan={2} />
      </TableRow>
      {open && rows.map((r) => <LicenseDetailRow key={r.id} r={r} indent />)}
    </>
  );
}

export function LicensesTable({ rows, grouped }: { rows: LicenseRow[]; grouped: boolean }) {
  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={8} className="text-center text-muted-foreground">
            No licenses match.
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  if (!grouped) {
    return (
      <TableBody>
        {rows.map((r) => <LicenseDetailRow key={r.id} r={r} indent={false} />)}
      </TableBody>
    );
  }

  const groupOrder: string[] = [];
  const groups = new Map<string, LicenseRow[]>();
  for (const r of rows) {
    if (!groups.has(r.customerId)) { groups.set(r.customerId, []); groupOrder.push(r.customerId); }
    groups.get(r.customerId)!.push(r);
  }

  return (
    <TableBody>
      {groupOrder.map((customerId) => {
        const group = groups.get(customerId)!;
        return (
          <CustomerGroup key={customerId} customerId={customerId} customerName={group[0].customerName} rows={group} />
        );
      })}
    </TableBody>
  );
}
