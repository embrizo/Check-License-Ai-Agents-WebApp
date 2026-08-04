import Link from "next/link";
import { listOrganizationsWithStats } from "@/server/data/admin/organizations";
import { getLastJobRun, listRecentJobRuns } from "@/server/data/admin/jobRuns";
import { AlerterStatus } from "./alerter-status";
import { RunCheckButton } from "./run-check-button";
import { CreateOrgForm } from "./create-org-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AdminOrganizationsPage() {
  const [orgs, lastRun, recent] = await Promise.all([
    listOrganizationsWithStats(),
    getLastJobRun(),
    listRecentJobRuns(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground">Create tenants, manage users, and extend subscriptions.</p>
        </div>
        <RunCheckButton />
      </div>

      {/* First panel on the page: whether the product is actually working
          outranks every configuration screen below it. */}
      <AlerterStatus lastRun={lastRun} recent={recent} />

      <Card>
        <CardContent className="pt-6">
          <CreateOrgForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{orgs.length} organization(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Licenses</TableHead>
                <TableHead>Subscription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/organizations/${org.id}`} className="hover:underline">{org.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>{org.userCount}</TableCell>
                  <TableCell>{org.licenseCount}</TableCell>
                  <TableCell>
                    {org.subscription ? (
                      <Badge variant={org.subscription.status === "active" ? "default" : "secondary"}>
                        {org.subscription.status} · expires{" "}
                        {org.subscription.expiresAt.toISOString().slice(0, 10)}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">none</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No organizations yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
