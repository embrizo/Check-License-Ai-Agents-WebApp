import { notFound } from "next/navigation";
import { getOrganization } from "@/server/data/organizations";
import { listUsers } from "@/server/data/users";
import { getActiveSubscription } from "@/server/data/subscriptions";
import { listAuditLogForOrg } from "@/server/data/admin/auditLog";
import { UserManagement } from "./user-management";
import { SubscriptionEditor } from "./subscription-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) notFound();

  const [users, subscription, auditEntries] = await Promise.all([
    listUsers(id),
    getActiveSubscription(id),
    listAuditLogForOrg(id, 50),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{org.name}</h1>

      <SubscriptionEditor orgId={id} subscription={subscription} />

      <UserManagement
        orgId={id}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive }))}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Audit log</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span>{entry.action}{entry.targetId ? ` · ${entry.targetId.slice(0, 8)}` : ""}</span>
                <span className="text-muted-foreground">{entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
            {auditEntries.length === 0 && <li className="text-muted-foreground">No actions recorded yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
