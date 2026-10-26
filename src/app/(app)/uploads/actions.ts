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
import { parse as parseFlexnet } from "@/server/domain/parsers/flexnet";
import { extractPrintableStrings } from "@/server/domain/binaryStrings";
import { extractPdfText } from "@/server/ingest/pdf";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { aiParse, QuotaError } from "@/server/ai/gemini";

const MAX_FILE_BYTES = 1_000_000; // docs/08 §Input handling
const MAX_FILES_PER_REQUEST = 20;
const ALLOWED_EXTENSIONS = /\.(lic|txt|dat|log|pdf|bin)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const BIN_EXTENSION = /\.bin$/i;

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
      results.push({ filename: file.name, status: "error", message: "Unsupported file type (.lic/.txt/.dat/.log/.pdf/.bin only)." });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = PDF_EXTENSION.test(file.name);
    const isBin = BIN_EXTENSION.test(file.name);

    // PDFs and FlexNet `.bin` capability responses are binary, so we extract
    // their readable text and treat that as the file content from here on. A
    // `.txt`/`.lic`/etc. is used as-is, with the binary guard rejecting
    // anything that isn't really text.
    let content: string;
    if (isPdf) {
      try {
        content = await extractPdfText(new Uint8Array(buffer));
      } catch {
        results.push({ filename: file.name, status: "error", message: "Couldn't read this PDF — it may be corrupt or password-protected." });
        continue;
      }
      if (!content) {
        results.push({ filename: file.name, status: "error", message: "No text found in this PDF — a scanned-image PDF can't be read." });
        continue;
      }
    } else if (isBin) {
      content = extractPrintableStrings(new Uint8Array(buffer)).join("\n");
      if (!content.trim()) {
        results.push({ filename: file.name, status: "error", message: "No readable text found in this .bin file." });
        continue;
      }
    } else {
      if (buffer.includes(0)) {
        results.push({ filename: file.name, status: "error", message: "File doesn't look like text (contains binary data)." });
        continue;
      }
      content = buffer.toString("utf-8");
    }

    const contentHash = hashContent(content);

    const existing = await getLicenseFileByName(orgId, customerId, file.name);
    if (existing && existing.contentHash === contentHash) {
      results.push({ filename: file.name, status: "unchanged" });
      continue;
    }

    // A .bin is a FlexNet capability response; everything else goes through the
    // FlexLM line parser (PDFs that aren't FlexLM fall through to AI parse).
    const { licenses: parsed, warnings } = isBin ? parseFlexnet(content) : parseFlexlm(content);
    const parseError = parsed.length === 0
      ? (isBin
          ? "No recognised FlexNet capability entitlements found in this file."
          : "No recognised FlexLM license lines found in this file.")
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
      ...(isBin ? { parseSource: "flexnet" as const } : {}),
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
