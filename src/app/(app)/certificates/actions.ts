"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/auth/guards";
import { guardErrorMessage } from "@/server/auth/actionError";
import {
  createCertificate, updateCertificate, deleteCertificate, getCertificate,
  type CertificateInput,
} from "@/server/data/certificates";
import { getCustomer } from "@/server/data/customers";
import { recordAuditLog } from "@/server/data/admin/auditLog";
import { isValidDateString, type CertCategory } from "@/server/domain/certificates";

export type CertFormState = { error?: string; success?: boolean } | undefined;

/**
 * Validates and normalises the shared form fields into a CertificateInput, or
 * returns a user-facing error string. Pure server-side gate: the client form's
 * presets and auto-fill are convenience only — nothing here trusts them.
 */
async function parseForm(orgId: string, formData: FormData): Promise<CertificateInput | { error: string }> {
  const category = formData.get("category") as string | null;
  if (category !== "personal" && category !== "inspection") {
    return { error: "Choose a certificate category." };
  }

  const certType = (formData.get("certType") as string | null)?.trim();
  if (!certType) return { error: "Choose or enter a certificate type." };

  const holderName = (formData.get("holderName") as string | null)?.trim() || null;
  if (category === "personal" && !holderName) {
    return { error: "A personal certificate needs the holder's name." };
  }

  const issueDate = (formData.get("issueDate") as string | null)?.trim() ?? "";
  if (!isValidDateString(issueDate)) return { error: "Enter a valid issue date." };

  const expireDate = (formData.get("expireDate") as string | null)?.trim() ?? "";
  if (!isValidDateString(expireDate)) return { error: "Enter a valid expiry date." };

  const renewalMonths = Number(formData.get("renewalMonths"));
  if (!Number.isInteger(renewalMonths) || renewalMonths <= 0 || renewalMonths > 600) {
    return { error: "Enter a renewal cycle in months (1–600)." };
  }

  let customerId = (formData.get("customerId") as string | null)?.trim() || null;
  if (customerId) {
    const customer = await getCustomer(orgId, customerId);
    if (!customer) return { error: "That site/customer doesn't belong to your organization." };
    customerId = customer.id;
  }

  const certNumber = (formData.get("certNumber") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  return {
    category: category as CertCategory,
    certType,
    holderName, // required for personal (checked above), optional for inspection
    certNumber,
    issueDate,
    expireDate,
    renewalMonths,
    notes,
    customerId,
  };
}

export async function createCertificateAction(
  _prevState: CertFormState,
  formData: FormData,
): Promise<CertFormState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  try {
    ({ orgId, session } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const parsed = await parseForm(orgId, formData);
  if ("error" in parsed) return { error: parsed.error };

  const created = await createCertificate(orgId, session.user.id, parsed);

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "certificate.create",
    targetType: "certificate",
    targetId: created.id,
    metadata: { certType: parsed.certType, holderName: parsed.holderName, expireDate: parsed.expireDate },
  });

  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateCertificateAction(
  certId: string,
  _prevState: CertFormState,
  formData: FormData,
): Promise<CertFormState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  try {
    ({ orgId, session } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const parsed = await parseForm(orgId, formData);
  if ("error" in parsed) return { error: parsed.error };

  const updated = await updateCertificate(orgId, certId, parsed);
  if (!updated) return { error: "That certificate doesn't belong to your organization." };

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "certificate.update",
    targetType: "certificate",
    targetId: certId,
    metadata: { certType: parsed.certType, expireDate: parsed.expireDate },
  });

  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteCertificateAction(certId: string): Promise<CertFormState> {
  let orgId: string;
  let session: Awaited<ReturnType<typeof requireOrg>>["session"];
  try {
    ({ orgId, session } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  const cert = await getCertificate(orgId, certId);
  if (!cert) return { error: "That certificate doesn't belong to your organization." };

  const deleted = await deleteCertificate(orgId, certId);
  if (!deleted) return { error: "Couldn't delete — please refresh and try again." };

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "certificate.delete",
    targetType: "certificate",
    targetId: certId,
    metadata: { certType: cert.certType, holderName: cert.holderName },
  });

  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  return { success: true };
}
