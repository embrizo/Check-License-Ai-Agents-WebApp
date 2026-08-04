import { requireOrg } from "@/server/auth/guards";
import { listCustomers } from "@/server/data/customers";
import { UploadForm } from "./upload-form";

export default async function UploadsPage() {
  const { orgId } = await requireOrg();
  const customers = await listCustomers(orgId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upload license files</h1>
        <p className="text-sm text-muted-foreground">
          .lic / .txt / .dat / .log, up to 1 MB each, 20 files per upload.
        </p>
      </div>
      <UploadForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
