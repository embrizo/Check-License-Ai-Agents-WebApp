import { requireOrg } from "@/server/auth/guards";
import { listAlertsForOrg } from "@/server/data/alertLog";
import { getI18n } from "@/i18n/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AlertsPage() {
  const { orgId } = await requireOrg();
  const { dict } = await getI18n();
  const d = dict.alerts;
  const alerts = await listAlertsForOrg(orgId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{d.title}</h1>
        <p className="text-sm text-muted-foreground">{d.subtitle}</p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{d.colSent}</TableHead>
              <TableHead>{d.colCustomer}</TableHead>
              <TableHead>{d.colProduct}</TableHead>
              <TableHead>{d.colThreshold}</TableHead>
              <TableHead>{d.colExpires}</TableHead>
              <TableHead>{d.colRecipients}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">{a.sentAt.toISOString().slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell>{a.customerName}</TableCell>
                <TableCell className="font-medium">{a.productName}</TableCell>
                <TableCell>≤ {a.thresholdDays}d</TableCell>
                <TableCell>{a.expireDate}</TableCell>
                <TableCell className="text-muted-foreground">{a.recipients}</TableCell>
              </TableRow>
            ))}
            {alerts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {d.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
