import Link from "next/link";
import { requireOrg } from "@/server/auth/guards";
import { listCustomersWithLicenseCounts } from "@/server/data/customers";
import { listDepartments } from "@/server/data/departments";
import { getI18n } from "@/i18n/server";
import { CreateCustomerForm, CustomerDepartmentSelect } from "./customer-forms";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function CustomersPage() {
  const { orgId, deptScope } = await requireOrg();
  const { dict } = await getI18n();
  const d = dict.customers;
  const [customers, departments] = await Promise.all([
    listCustomersWithLicenseCounts(orgId, deptScope),
    listDepartments(orgId),
  ]);
  // Only a caller who sees every department can file customers into one.
  const canChoose = "all" in deptScope;
  const deptOptions = departments.map((dpt) => ({ id: dpt.id, name: dpt.name }));
  const deptName = new Map(deptOptions.map((dpt) => [dpt.id, dpt.name]));
  const showDeptColumn = departments.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{d.title}</h1>

      <Card>
        <CardContent className="pt-6">
          <CreateCustomerForm departments={deptOptions} canChooseDepartment={canChoose} />
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{d.colName}</TableHead>
              {showDeptColumn && <TableHead>Department</TableHead>}
              <TableHead>{d.colLicenses}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/customers/${c.id}`} className="hover:underline">{c.name}</Link>
                </TableCell>
                {showDeptColumn && (
                  <TableCell>
                    {canChoose ? (
                      <CustomerDepartmentSelect customerId={c.id} departmentId={c.departmentId} departments={deptOptions} />
                    ) : (
                      <span className="text-muted-foreground">{c.departmentId ? deptName.get(c.departmentId) ?? "—" : "—"}</span>
                    )}
                  </TableCell>
                )}
                <TableCell>{c.licenseCount}</TableCell>
              </TableRow>
            ))}
            {customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={showDeptColumn ? 3 : 2} className="text-center text-muted-foreground">{d.empty}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
