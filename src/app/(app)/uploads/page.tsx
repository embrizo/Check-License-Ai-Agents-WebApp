import { requireOrg } from "@/server/auth/guards";
import { listCustomers } from "@/server/data/customers";
import { getI18n } from "@/i18n/server";
import { UploadForm } from "./upload-form";

export default async function UploadsPage() {
  const { orgId, deptScope } = await requireOrg();
  const { dict } = await getI18n();
  const customers = await listCustomers(orgId, deptScope);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{dict.uploads.title}</h1>
        <p className="text-sm text-muted-foreground">
          {dict.uploads.subtitle}
        </p>
      </div>
      <UploadForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
