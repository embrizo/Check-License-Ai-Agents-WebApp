import { notFound } from "next/navigation";
import { requireOrg } from "@/server/auth/guards";
import { getCustomer } from "@/server/data/customers";
import { listContacts } from "@/server/data/contacts";
import { listLicenseFiles } from "@/server/data/licenseFiles";
import { listLicensesByCustomer } from "@/server/data/licenses";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining, bucketFor, type ExpiryBucket } from "@/server/domain/thresholds";
import { formatSeats } from "@/server/domain/seats";
import { AddContactForm, DeleteContactButton, DeleteCustomerButton } from "../customer-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReviewCell } from "../../licenses/review-cell";
import { LicenseAttributes } from "../../licenses/license-attributes";
import { RenewalDraftDialog } from "../../licenses/renewal-draft-dialog";
import { DeleteLicenseButton } from "../../licenses/delete-license-button";

const BUCKET_BADGE: Record<ExpiryBucket, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  expired: { label: "Expired", variant: "destructive" },
  critical: { label: "≤ 15 days", variant: "destructive" },
  warning: { label: "≤ 30 days", variant: "secondary" },
  ok: { label: "Healthy", variant: "default" },
  perpetual: { label: "Perpetual", variant: "outline" },
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireOrg();

  const customer = await getCustomer(orgId, id);
  if (!customer) notFound();

  const [settings, contacts, files, licenses] = await Promise.all([
    getOrgSettings(orgId),
    listContacts(orgId, id),
    listLicenseFiles(orgId, id),
    listLicensesByCustomer(orgId, id),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";

  const defaultRecipients = contacts.filter((c) => c.notify).map((c) => c.email).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        <DeleteCustomerButton customerId={customer.id} name={customer.name} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Licenses ({licenses.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((lic) => {
                  const badge = BUCKET_BADGE[bucketFor(daysRemaining(lic.expireDate, timezone))];
                  return (
                    <TableRow key={lic.id}>
                      <TableCell className="font-medium">
                        {lic.productName}
                        <LicenseAttributes metadata={lic.metadata} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lic.vendor ?? "—"}</TableCell>
                      <TableCell>{lic.expireDate ?? "—"}</TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell>{formatSeats(lic.seats)}</TableCell>
                      <TableCell>
                        {lic.reviewState === "pending_review" && (
                          <ReviewCell licenseId={lic.id} confidence={lic.confidence} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <RenewalDraftDialog licenseId={lic.id} defaultTo={defaultRecipients} />
                          <DeleteLicenseButton licenseId={lic.id} productName={lic.productName} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {licenses.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No licenses yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Uploaded files ({files.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span>{f.filename}</span>
                {f.parseError ? (
                  <span className="text-muted-foreground">{f.parseError}</span>
                ) : (
                  <Badge variant="default">parsed</Badge>
                )}
              </li>
            ))}
            {files.length === 0 && <li className="text-muted-foreground">No files uploaded yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contacts ({contacts.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 border-b pb-2 last:border-0">
                <div>
                  <div className="font-medium">{c.name || c.email}</div>
                  <div className="text-sm text-muted-foreground">{c.email} {c.notify && "· notified on alerts"}</div>
                </div>
                <DeleteContactButton customerId={id} contactId={c.id} email={c.email} />
              </li>
            ))}
            {contacts.length === 0 && <li className="text-muted-foreground">No contacts yet.</li>}
          </ul>

          <AddContactForm customerId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
