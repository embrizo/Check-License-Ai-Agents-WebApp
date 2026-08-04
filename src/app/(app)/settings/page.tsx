import { requireOrg } from "@/server/auth/guards";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { orgId } = await requireOrg({ role: "org_admin" });
  const settings = await getOrgSettings(orgId);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Org-wide alert configuration. Personal Reply-To lives on your{" "}
          <a href="/profile" className="underline">profile</a>.
        </p>
      </div>
      <SettingsForm
        alertThresholds={(settings?.alertThresholds ?? [30, 15]).join(", ")}
        alertRecipients={(settings?.alertRecipients ?? []).join("\n")}
        productFilterRegex={settings?.productFilterRegex ?? ""}
        timezone={settings?.timezone ?? "Asia/Bangkok"}
        notifyCustomerContacts={settings?.notifyCustomerContacts ?? false}
        aiEnabled={settings?.aiEnabled ?? true}
      />
    </div>
  );
}
