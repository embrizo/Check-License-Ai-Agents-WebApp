import Link from "next/link";
import { requireOrg } from "@/server/auth/guards";
import { listCustomersWithLicenseCounts } from "@/server/data/customers";
import { CreateCustomerForm } from "./customer-forms";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function CustomersPage() {
  const { orgId } = await requireOrg();
  const customers = await listCustomersWithLicenseCounts(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Customers</h1>

      <Card>
        <CardContent className="pt-6">
          <CreateCustomerForm />
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Licenses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`} className="hover:underline">{c.name}</Link>
                </TableCell>
                <TableCell>{c.licenseCount}</TableCell>
              </TableRow>
            ))}
            {customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">No customers yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
