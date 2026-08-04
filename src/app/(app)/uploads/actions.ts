"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/auth/guards";
import type { Session } from "next-auth";
import { guardErrorMessage } from "@/server/auth/actionError";
import { getCustomer, createCustomer } from "@/server/data/customers";
import { getLicenseFileByName, upsertLicenseFile, getLicenseFile, setLicenseFileParseError } from "@/server/data/licenseFiles";
import { upsertLicensesForFile, upsertAiLicensesForFile } from "@/server/data/licenses";
import { hashContent } from "@/server/domain/hashing";
import { parse as parseFlexlm } from "@/server/domain/parsers/flexlm";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { aiParse, QuotaError } from "@/server/ai/gemini";

const MAX_FILE_BYTES = 1_000_000; // docs/08 §Input handling
const MAX_FILES_PER_REQUEST = 20;
const ALLOWED_EXTENSIONS = /\.(lic|txt|dat|log)$/i;

export type UploadFileResult =
  | { filename: string; status: "parsed"; upserted: number; staleDeleted: number }
  | { filename: string; status: "unchanged" }
  | { filename: string; status: "unrecognised"; message: string; licenseFileId: string }
  | { filename: string; status: "error"; message: string };

export type UploadState = { results: UploadFileResult[]; error?: string } | undefined;

export async function uploadLicenseFiles(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  let orgId: string;
  let session: Session;
  try {
    ({ orgId, session } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { results: [], error: message };
    throw err;
  }

  const customerId = formData.get("customerId") as string | null;
  if (!customerId) return { results: [], error: "Choose a customer first." };

  const customer = await getCustomer(orgId, customerId);
  if (!customer) return { results: [], error: "That customer doesn't belong to your organization." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { results: [], error: "Choose at least one file." };
  if (files.length > MAX_FILES_PER_REQUEST) {
    return { results: [], error: `Too many files — max ${MAX_FILES_PER_REQUEST} per upload.` };
  }

  const results: UploadFileResult[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({ filename: file.name, status: "error", message: "File too large (max 1 MB)." });
      continue;
    }
    if (!ALLOWED_EXTENSIONS.test(file.name)) {
      results.push({ filename: file.name, status: "error", message: "Unsupported file type (.lic/.txt/.dat/.log only)." });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.includes(0)) {
      results.push({ filename: file.name, status: "error", message: "File doesn't look like text (contains binary data)." });
      continue;
    }

    const content = buffer.toString("utf-8");
    const contentHash = hashContent(content);

    const existing = await getLicenseFileByName(orgId, customerId, file.name);
    if (existing && existing.contentHash === contentHash) {
      results.push({ filename: file.name, status: "unchanged" });
      continue;
    }

    const { licenses: parsed, warnings } = parseFlexlm(content);
    const parseError = parsed.length === 0
      ? "No recognised FlexLM license lines found in this file."
      : (warnings.length > 0 ? warnings.join("; ") : null);

    const { file: fileRow } = await upsertLicenseFile({
      organizationId: orgId,
      customerId,
      filename: file.name,
      content,
      contentHash,
      sizeBytes: buffer.length,
      parseError,
      uploadedBy: session.user.id,
    });

    if (parsed.length === 0) {
      results.push({ filename: file.name, status: "unrecognised", message: parseError!, licenseFileId: fileRow.id });
      continue;
    }

    const { upserted, staleDeleted } = await upsertLicensesForFile({
      organizationId: orgId,
      customerId,
      licenseFileId: fileRow.id,
      parsed,
    });
    results.push({ filename: file.name, status: "parsed", upserted, staleDeleted: staleDeleted.length });
  }

  revalidatePath("/licenses");
  revalidatePath("/dashboard");
  revalidatePath("/uploads");
  return { results };
}

export type AiParseState =
  | { ok: true; upserted: number; skippedConfirmed: number; formatGuess: string; notes: string | null }
  | { ok: false; error: string };

/**
 * User-triggered, not automatic (docs/05 Feature A) — cost proportional to
 * value, and it makes the AI involvement explicit to the person reviewing
 * it. Rows land `pending_review`; they never trigger an alert until a human
 * confirms them (docs/05 rule 2).
 */
export async function tryAiParseAction(licenseFileId: string): Promise<AiParseState> {
  const { orgId, session } = await requireOrg({ write: true });

  const settings = await getOrgSettings(orgId);
  if (settings?.aiEnabled === false) {
    return { ok: false, error: "AI features are disabled for this organization." };
  }

  const file = await getLicenseFile(orgId, licenseFileId);
  if (!file) return { ok: false, error: "File not found." };

  try {
    const result = await aiParse(orgId, session.user.id, file.content);
    const { upserted, skippedConfirmed } = await upsertAiLicensesForFile({
      organizationId: orgId,
      customerId: file.customerId,
      licenseFileId: file.id,
      parsed: result.licenses,
    });
    await setLicenseFileParseError(
      file.id,
      result.licenses.length === 0 ? "AI parse found no license entitlements either." : null,
    );

    revalidatePath("/licenses");
    revalidatePath("/customers");
    revalidatePath("/customers/[id]", "page");
    revalidatePath("/dashboard");
    return { ok: true, upserted, skippedConfirmed, formatGuess: result.formatGuess, notes: result.notes ?? null };
  } catch (err) {
    if (err instanceof QuotaError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "AI parse failed." };
  }
}

export type QuickCreateCustomerState =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

export async function quickCreateCustomer(name: string): Promise<QuickCreateCustomerState> {
  let orgId: string;
  try {
    ({ orgId } = await requireOrg({ write: true }));
  } catch (err) {
    const message = guardErrorMessage(err);
    if (message) return { ok: false, error: message };
    throw err;
  }

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a customer name." };

  const customer = await createCustomer(orgId, trimmed);
  if (!customer) return { ok: false, error: `You already have a customer called "${trimmed}".` };

  revalidatePath("/uploads");
  revalidatePath("/customers");
  return { ok: true, id: customer.id, name: customer.name };
}
