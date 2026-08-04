"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/auth/guards";
import { guardErrorMessage } from "@/server/auth/actionError";
import { upsertOrgSettings } from "@/server/data/organizationSettings";
import { partitionEmails, splitEmailList } from "@/server/domain/email";

const SettingsInput = z.object({
  alertThresholds: z.string().transform((v) =>
    v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)),
  alertRecipients: z.string().transform(splitEmailList),
  productFilterRegex: z.string().transform((v) => v.trim() || null),
  timezone: z.string().min(1),
  notifyCustomerContacts: z.boolean(),
  aiEnabled: z.boolean(),
});

export type SettingsState = { error?: string; success?: boolean } | undefined;

export async function saveSettings(_prevState: SettingsState, formData: FormData): Promise<SettingsState> {
  // org_admin+ only (docs/04 roles table) — the nav link is hidden for
  // `member`, but that's UX only; this is the real check.
  let orgId: string;
  try {
    ({ orgId } = await requireOrg({ role: "org_admin", write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const parsed = SettingsInput.safeParse({
    alertThresholds: formData.get("alertThresholds") ?? "",
    alertRecipients: formData.get("alertRecipients") ?? "",
    productFilterRegex: formData.get("productFilterRegex") ?? "",
    timezone: formData.get("timezone") ?? "Asia/Bangkok",
    notifyCustomerContacts: formData.get("notifyCustomerContacts") === "on",
    aiEnabled: formData.get("aiEnabled") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.alertThresholds.length === 0) {
    return { error: "At least one alert threshold is required." };
  }

  // Refuse the save rather than storing a malformed address: Resend rejects
  // the whole send if any recipient is invalid, so one typo here would
  // silently stop every alert for this organization (see buildRecipients).
  const { valid, invalid } = partitionEmails(parsed.data.alertRecipients);
  if (invalid.length > 0) {
    return {
      error: `Not a valid email address: ${invalid.join(", ")}. Fix or remove it — one bad address stops every alert for your organization.`,
    };
  }

  // A malformed regex would be caught and treated as "match everything" at
  // send time; better to reject it here, while the author is looking at it.
  if (parsed.data.productFilterRegex) {
    try {
      new RegExp(parsed.data.productFilterRegex);
    } catch {
      return { error: "That product filter isn't a valid regular expression." };
    }
  }

  await upsertOrgSettings(orgId, { ...parsed.data, alertRecipients: valid });
  revalidatePath("/settings");
  return { success: true };
}
