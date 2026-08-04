import Link from "next/link";
import { requireOrg } from "@/server/auth/guards";
import { listLicensesWithCustomer } from "@/server/data/licenses";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor } from "@/server/domain/thresholds";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LicensesTable } from "./licenses-table";
import {
  Table, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type SortKey = "product" | "customer" | "expire" | "seats";

function sortLink(current: { q?: string; bucket?: string; sort?: string; dir?: string; group?: string }, key: SortKey, label: string) {
  const nextDir = current.sort === key && current.dir !== "desc" ? "desc" : "asc";
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.bucket) params.set("bucket", current.bucket);
  if (current.group) params.set("group", current.group);
  params.set("sort", key);
  params.set("dir", nextDir);
  const active = current.sort === key;
  return (
    <Link href={`/licenses?${params.toString()}`} className="inline-flex items-center gap-1 hover:underline">
      {label}{active && <span className="text-xs">{current.dir === "desc" ? "↓" : "↑"}</span>}
    </Link>
  );
}

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bucket?: string; sort?: string; dir?: string; group?: string }>;
}) {
  const { orgId } = await requireOrg();
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const bucketFilter = params.bucket ?? "all";
  const sort = (params.sort as SortKey) ?? "expire";
  const dir = params.dir === "desc" ? "desc" : "asc";
  const grouped = params.group === "1";

  const [settings, licenses] = await Promise.all([
    getOrgSettings(orgId),
    listLicensesWithCustomer(orgId),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";

  const allRows = licenses.map((lic) => {
    const remaining = daysRemaining(lic.expireDate, timezone);
    return { ...lic, remaining, bucket: bucketFor(remaining) };
  });

  const bucketCounts: Record<string, number> = { all: allRows.length };
  for (const r of allRows) bucketCounts[r.bucket] = (bucketCounts[r.bucket] ?? 0) + 1;

  let rows = allRows;
  if (q) {
    rows = rows.filter((r) =>
      r.productName.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      (r.vendor ?? "").toLowerCase().includes(q));
  }
  if (bucketFilter !== "all") {
    rows = rows.filter((r) => r.bucket === bucketFilter);
  }

  rows.sort((a, b) => {
    let cmp = 0;
    if (sort === "product") cmp = a.productName.localeCompare(b.productName);
    else if (sort === "customer") cmp = a.customerName.localeCompare(b.customerName);
    else if (sort === "seats") cmp = (a.seats ?? 0) - (b.seats ?? 0);
    else cmp = (a.remaining ?? Infinity) - (b.remaining ?? Infinity);
    return dir === "desc" ? -cmp : cmp;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Licenses</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{rows.length} of {licenses.length}</span>
          <a href="/api/export/xlsx" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Export .xlsx
          </a>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/licenses">
        {sort && <input type="hidden" name="sort" value={sort} />}
        {dir && <input type="hidden" name="dir" value={dir} />}
        {grouped && <input type="hidden" name="group" value="1" />}
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Search product, customer, vendor…" className="max-w-xs" />
        <div className="flex flex-wrap gap-1">
          {(["all", "expired", "critical", "warning", "ok", "perpetual"] as const).map((b) => (
            <Link
              key={b}
              href={`/licenses?${new URLSearchParams({ ...(q ? { q } : {}), ...(b !== "all" ? { bucket: b } : {}), sort, dir, ...(grouped ? { group: "1" } : {}) }).toString()}`}
            >
              <Badge variant={bucketFilter === b ? "default" : "outline"} className="cursor-pointer">
                {b} {bucketCounts[b] !== undefined ? `(${bucketCounts[b]})` : ""}
              </Badge>
            </Link>
          ))}
        </div>
        <Link
          href={`/licenses?${new URLSearchParams({ ...(q ? { q } : {}), ...(bucketFilter !== "all" ? { bucket: bucketFilter } : {}), sort, dir, ...(grouped ? {} : { group: "1" }) }).toString()}`}
        >
          <Badge variant={grouped ? "default" : "outline"} className="cursor-pointer">
            Group by customer
          </Badge>
        </Link>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sortLink(params, "product", "Product")}</TableHead>
              <TableHead>{sortLink(params, "customer", "Customer")}</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>{sortLink(params, "expire", "Expires")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{sortLink(params, "seats", "Seats")}</TableHead>
              <TableHead>Review</TableHead>
            </TableRow>
          </TableHeader>
          <LicensesTable rows={rows} grouped={grouped} />
        </Table>
      </div>
    </div>
  );
}
