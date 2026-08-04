"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/server/auth/guards";
import { guardErrorMessage } from "@/server/auth/actionError";
import { confirmLicense, rejectAiLicense, getLicenseWithCustomer } from "@/server/data/licenses";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { getUserById } from "@/server/data/users";
import { recordAuditLog } from "@/server/data/admin/auditLog";
import { daysRemaining } from "@/server/domain/thresholds";
import { isValidEmail } from "@/server/domain/email";
import { draftRenewalEmail, QuotaError } from "@/server/ai/gemini";
import { sendEmail } from "@/server/mail/send";

export type ReviewActionState = { ok: true } | { error: string };

/**
 * `revalidatePath("/customers")` alone would refresh only the customer *list*
 * — a literal path never matches a dynamic segment. The review buttons live on
 * /customers/[id], so without the explicit `"page"` form the row the user just
 * confirmed keeps rendering as pending until a hard reload, and they click it
 * again assuming it failed.
 */
function revalidateReviewSurfaces() {
  revalidatePath("/licenses");
  revalidatePath("/customers");
  revalidatePath("/customers/[id]", "page");
  revalidatePath("/dashboard");
}

/** A human confirming an AI guess is what allows it to ever trigger an alert (docs/05 rule 2). */
export async function confirmLicenseAction(licenseId: string): Promise<ReviewActionState> {
  try {
    const { orgId } = await requireOrg({ write: true });
    await confirmLicense(orgId, licenseId);
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidateReviewSurfaces();
  return { ok: true };
}

export async function rejectLicenseAction(licenseId: string): Promise<ReviewActionState> {
  try {
    const { orgId } = await requireOrg({ write: true });
    await rejectAiLicense(orgId, licenseId);
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidateReviewSurfaces();
  return { ok: true };
}

export type DraftRenewalState =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string };

/**
 * Highest perceived value per token of the three AI features (docs/05
 * Feature C) — but it never sends anything itself. Draft → human edits →
 * human clicks send, always.
 */
export async function draftRenewalAction(
  licenseId: string,
  tone: "formal" | "friendly",
  language: "English" | "Thai",
): Promise<DraftRenewalState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  try {
    ({ orgId, session } = await requireOrg());
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { ok: false, error: message };
    throw err;
  }

  const settings = await getOrgSettings(orgId);
  if (settings?.aiEnabled === false) {
    return { ok: false, error: "AI features are disabled for this organization." };
  }

  const license = await getLicenseWithCustomer(orgId, licenseId);
  if (!license) return { ok: false, error: "License not found." };

  const timezone = settings?.timezone ?? "Asia/Bangkok";
  const remaining = daysRemaining(license.expireDate, timezone);

  try {
    const draft = await draftRenewalEmail(orgId, session.user.id, {
      customer: license.customerName,
      product: license.productName,
      expireDate: license.expireDate ?? "unknown",
      daysRemaining: remaining ?? 0,
      seats: license.seats,
      tone,
      language,
    });
    return { ok: true, ...draft };
  } catch (err) {
    if (err instanceof QuotaError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Draft generation failed." };
  }
}

const SendRenewalInput = z.object({
  to: z.string().transform((v) => v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type SendRenewalState = { ok: true } | { ok: false; error: string };

export async function sendRenewalEmailAction(
  licenseId: string,
  input: { to: string; subject: string; body: string },
): Promise<SendRenewalState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  try {
    ({ orgId, session } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { ok: false, error: message };
    throw err;
  }

  const parsed = SendRenewalInput.safeParse(input);
  if (!parsed.success || parsed.data.to.length === 0) {
    return { ok: false, error: "Enter at least one recipient." };
  }

  // Same reason as org alert recipients: the provider rejects the entire send
  // if any one address is malformed (see domain/email.ts).
  const badAddresses = parsed.data.to.filter((address) => !isValidEmail(address));
  if (badAddresses.length > 0) {
    return { ok: false, error: `Not a valid email address: ${badAddresses.join(", ")}` };
  }

  const license = await getLicenseWithCustomer(orgId, licenseId);
  if (!license) return { ok: false, error: "License not found." };

  const user = await getUserById(session.user.id);
  const html = parsed.data.body.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  const result = await sendEmail({
    to: parsed.data.to,
    subject: parsed.data.subject,
    text: parsed.data.body,
    html,
    // Personal, not automated — replies go to the sender, per docs/01 D8.
    replyTo: user?.replyToEmail ?? undefined,
  });

  if (!result.ok) return { ok: false, error: result.error ?? "Send failed." };

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "license.renewal_email_sent",
    targetType: "license",
    targetId: licenseId,
    metadata: { to: parsed.data.to, subject: parsed.data.subject },
  });

  return { ok: true };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
