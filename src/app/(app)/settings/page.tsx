import { requireOrg } from "@/server/auth/guards";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { getI18n } from "@/i18n/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { orgId } = await requireOrg({ role: "org_admin" });
  const { dict } = await getI18n();
  const d = dict.settings;
  const settings = await getOrgSettings(orgId);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{d.title}</h1>
        <p className="text-sm text-muted-foreground">
          {d.subtitlePrefix}{" "}
          <a href="/profile" className="underline">{d.profileWord}</a>.
        </p>
      </div>
      <SettingsForm
        alertThresholds={(settings?.alertThresholds ?? [30, 15]).join(", ")}
        alertRecipients={(settings?.alertRecipients ?? []).join("\n")}
        productFilterRegex={settings?.productFilterRegex ?? ""}
        timezone={settings?.timezone ?? "Asia/Bangkok"}
        alertSendHour={settings?.alertSendHour ?? 8}
        notifyCustomerContacts={settings?.notifyCustomerContacts ?? false}
        aiEnabled={settings?.aiEnabled ?? true}
      />
    </div>
  );
}
