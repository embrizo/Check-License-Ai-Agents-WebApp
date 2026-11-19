import Link from "next/link";
import { requireOrgAccess } from "@/server/auth/guards";
import { listLicenses } from "@/server/data/licenses";
import { listCertificatesWithCustomer } from "@/server/data/certificates";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor, type ExpiryBucket } from "@/server/domain/thresholds";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const { session, orgId, deptScope } = await requireOrgAccess();
  const { dict } = await getI18n();

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

  const [settings, licenses, certs] = await Promise.all([
    getOrgSettings(orgId),
    listLicenses(orgId, deptScope),
    listCertificatesWithCustomer(orgId, deptScope),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";

  const counts: Record<ExpiryBucket, number> = {
    expired: 0, critical: 0, warning: 0, ok: 0, perpetual: 0,
  };
  for (const lic of licenses) {
    const remaining = daysRemaining(lic.expireDate, timezone);
    counts[bucketFor(remaining)]++;
  }

  // Certs never have a null expiry, so the "perpetual" bucket is always 0 — show
  // the four meaningful buckets only.
  const certCounts: Record<ExpiryBucket, number> = {
    expired: 0, critical: 0, warning: 0, ok: 0, perpetual: 0,
  };
  for (const c of certs) {
    certCounts[bucketFor(daysRemaining(c.expireDate, timezone))]++;
  }
  const certBuckets: ExpiryBucket[] = ["expired", "critical", "warning", "ok"];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{dict.dashboard.welcome}, {session.user.name ?? session.user.email}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(counts) as ExpiryBucket[]).map((bucket) => (
          <Card key={bucket}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {dict.buckets[bucket]}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{counts[bucket]}</CardContent>
          </Card>
        ))}
      </div>
      {licenses.length === 0 && (
        <p className="text-muted-foreground">
          {dict.dashboard.noLicenses}{" "}
          <Link href="/uploads" className="underline">
            {dict.dashboard.uploadToStart}
          </Link>{" "}
          {dict.dashboard.toGetStarted}
        </p>
      )}

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{dict.dashboard.certsHeading}</h2>
          <Link href="/certificates" className="text-sm underline">{dict.dashboard.viewAll}</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {certBuckets.map((bucket) => (
            <Card key={bucket}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {dict.buckets[bucket]}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{certCounts[bucket]}</CardContent>
            </Card>
          ))}
        </div>
        {certs.length === 0 && (
          <p className="text-muted-foreground">
            {dict.dashboard.noCerts}{" "}
            <Link href="/certificates" className="underline">{dict.dashboard.addCertToStart}</Link>{" "}
            {dict.dashboard.toTrack}
          </p>
        )}
      </div>
    </div>
  );
}
