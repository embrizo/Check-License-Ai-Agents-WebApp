import Link from "next/link";
import { requireOrgAccess } from "@/server/auth/guards";
import { listLicenses } from "@/server/data/licenses";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor, type ExpiryBucket } from "@/server/domain/thresholds";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const BUCKET_LABEL: Record<ExpiryBucket, string> = {
  expired: "Expired",
  critical: "≤ 15 days",
  warning: "≤ 30 days",
  ok: "Healthy",
  perpetual: "Perpetual / unknown",
};

export default async function DashboardPage() {
  const { session, orgId } = await requireOrgAccess();

  if (!orgId) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Welcome, {session.user.name ?? session.user.email}</h1>
        <p className="text-muted-foreground">
          You&apos;re signed in as super_admin with no organization context. Manage
          tenants from{" "}
          <Link href="/admin" className="underline">
            the admin console
          </Link>
          .
        </p>
      </div>
    );
  }

  const [settings, licenses] = await Promise.all([
    getOrgSettings(orgId),
    listLicenses(orgId),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";

  const counts: Record<ExpiryBucket, number> = {
    expired: 0, critical: 0, warning: 0, ok: 0, perpetual: 0,
  };
  for (const lic of licenses) {
    const remaining = daysRemaining(lic.expireDate, timezone);
    counts[bucketFor(remaining)]++;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Welcome, {session.user.name ?? session.user.email}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(counts) as ExpiryBucket[]).map((bucket) => (
          <Card key={bucket}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {BUCKET_LABEL[bucket]}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{counts[bucket]}</CardContent>
          </Card>
        ))}
      </div>
      {licenses.length === 0 && (
        <p className="text-muted-foreground">
          No licenses yet.{" "}
          <Link href="/uploads" className="underline">
            Upload a license file
          </Link>{" "}
          to get started.
        </p>
      )}
    </div>
  );
}
