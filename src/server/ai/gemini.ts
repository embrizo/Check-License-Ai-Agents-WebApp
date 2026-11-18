import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { countAiCallsThisMonth, logAiUsage } from "@/server/data/aiUsage";
import { getActiveSubscription } from "@/server/data/subscriptions";
import { cleanAttributes } from "@/server/domain/licenseAttributes";
import { CERT_TYPE_PRESETS } from "@/server/domain/certificates";

export class QuotaError extends Error {
  constructor(message: string) { super(message); this.name = "QuotaError"; }
}

/** Called before every Gemini request — the quota exists to bound the tail (a bug or an abusive tenant), not the normal case (docs/05 §3). */
export async function assertAiQuota(orgId: string) {
  const sub = await getActiveSubscription(orgId);
  const limit = sub?.aiCallsPerMonth ?? 200;
  const used = await countAiCallsThisMonth(orgId);
  if (used >= limit) {
    throw new QuotaError(`AI limit reached (${used}/${limit} this month).`);
  }
}

/* ---------- Feature A: parse an unrecognised license format ---------- */

// coerce: an all-digit activation/hardware-key id the model returns as a JSON
// number becomes a string instead of failing validation.
const AiLicenseAttribute = z.object({ label: z.coerce.string(), value: z.coerce.string() });

const AiParsedLicense = z.object({
  productName: z.string(),
  vendor: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  licenseKey: z.string().nullable().optional(),
  expireDate: z.string().nullable().optional(),
  seats: z.number().int().nullable().optional(),
  status: z.enum(["ACTIVE", "PERPETUAL", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  // Extra identifiers with no dedicated column (e.g. a Kepware PDF's Emergency
  // Activation ID, Hardware Key ID, Cert Required) — stored on licenses.metadata.
  // `.catch` keeps a malformed attribute from aborting the whole file's parse:
  // on failure the field drops to undefined and the license (and its other
  // fields) survives, the same resilience contract postValidate provides.
  attributes: z.array(AiLicenseAttribute).nullable().optional().catch(undefined),
});

const AiParseResult = z.object({
  licenses: z.array(AiParsedLicense),
  formatGuess: z.string(),
  notes: z.string().nullable().optional(),
});

export type AiParsedLicense = z.infer<typeof AiParsedLicense>;
export type AiParseResult = z.infer<typeof AiParseResult>;

const PARSE_MODEL = "gemini-3.8-flash";

const PARSE_SYSTEM = `You extract software license entitlements from license files.

Rules:
- Extract ONLY what is literally present. Never infer or guess a date.
- If an expiry date is absent or the license is permanent/perpetual, set
  expireDate to null and status to PERPETUAL.
- If you cannot determine a field, use null. Do not substitute a plausible value.
- Ambiguous or unreadable date -> expireDate null, status UNKNOWN, confidence < 0.5.
- Dates like "31-dec-2026" are day-month-year. Convert to 2026-12-31.
- Put any additional identifiers or fields that belong to a license but don't fit
  the fields above — e.g. activation IDs, emergency activation IDs, hardware key
  IDs, certificate requirements — into "attributes" as {label, value} pairs, using
  the label exactly as the document presents it. Do not repeat a value you already
  placed in another field. Omit attributes entirely if there are none.
- Return an empty licenses array if the document contains no license entitlements.`;

const PARSE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    licenses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING },
          vendor: { type: Type.STRING, nullable: true },
          version: { type: Type.STRING, nullable: true },
          licenseKey: { type: Type.STRING, nullable: true },
          expireDate: { type: Type.STRING, nullable: true, description: "ISO 8601 YYYY-MM-DD, or null if perpetual/absent" },
          seats: { type: Type.INTEGER, nullable: true },
          status: { type: Type.STRING, enum: ["ACTIVE", "PERPETUAL", "UNKNOWN"] },
          confidence: { type: Type.NUMBER, description: "0..1" },
          attributes: {
            type: Type.ARRAY,
            description: "Extra identifiers/fields that don't fit the columns above (activation IDs, hardware key IDs, cert requirements, …), as label/value pairs. Omit if none.",
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["productName", "status", "confidence"],
      },
    },
    formatGuess: { type: Type.STRING },
    notes: { type: Type.STRING, nullable: true },
  },
  required: ["licenses", "formatGuess"],
};

/**
 * These catch failures the response schema can't (docs/05 §2):
 * - expireDate must parse as a real date within today ±20y/+30y — a 1970 or
 *   2140 date is a hallucination or a misread format, not a real license.
 * - seats must be a non-negative integer.
 * Rows that fail are dropped rather than trusted; the caller sees fewer
 * licenses than Gemini claimed, never a bad one.
 */
function postValidate(result: AiParseResult): AiParseResult {
  const thisYear = new Date().getFullYear();
  const minYear = thisYear - 20;
  const maxYear = thisYear + 30;

  const licenses = result.licenses
    .filter((lic) => {
      if (lic.expireDate) {
        const match = /^(\d{4})-\d{2}-\d{2}$/.exec(lic.expireDate);
        if (!match) return false;
        const year = Number(match[1]);
        if (year < minYear || year > maxYear) return false;
      }
      if (lic.seats != null && lic.seats < 0) return false;
      return true;
    })
    .map((lic) => ({ ...lic, attributes: cleanAttributes(lic.attributes) }));

  return { ...result, licenses };
}

/** orgId/userId are for quota + audit (ai_usage) — never sent to Gemini itself. */
export async function aiParse(orgId: string, userId: string, content: string): Promise<AiParseResult> {
  await assertAiQuota(orgId);

  const { GEMINI_API_KEY } = getEnv();
  if (!GEMINI_API_KEY) {
    throw new Error("AI parsing isn't configured for this deployment (GEMINI_API_KEY missing).");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  let succeeded = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const res = await ai.models.generateContent({
      model: PARSE_MODEL,
      contents: [{ role: "user", parts: [{ text: content.slice(0, 100_000) }] }],
      config: {
        systemInstruction: PARSE_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: PARSE_RESPONSE_SCHEMA,
        temperature: 0, // extraction, not creativity
      },
    });

    inputTokens = res.usageMetadata?.promptTokenCount ?? null;
    outputTokens = res.usageMetadata?.candidatesTokenCount ?? null;

    const parsed = AiParseResult.parse(JSON.parse(res.text ?? "{}"));
    succeeded = true;
    return postValidate(parsed);
  } finally {
    await logAiUsage({
      organizationId: orgId,
      userId,
      feature: "parse",
      model: PARSE_MODEL,
      inputTokens,
      outputTokens,
      succeeded,
    });
  }
}

/* ---------- Feature C: draft a renewal email ---------- */

const DraftResult = z.object({ subject: z.string(), body: z.string() });
export type DraftResult = z.infer<typeof DraftResult>;

const DRAFT_MODEL = "gemini-3.8-flash";

export async function draftRenewalEmail(
  orgId: string,
  userId: string,
  input: {
    customer: string;
    product: string;
    expireDate: string;
    daysRemaining: number;
    seats: number | null;
    tone: "formal" | "friendly";
    language: "English" | "Thai";
  },
): Promise<DraftResult> {
  await assertAiQuota(orgId);

  const { GEMINI_API_KEY } = getEnv();
  if (!GEMINI_API_KEY) {
    throw new Error("AI drafting isn't configured for this deployment (GEMINI_API_KEY missing).");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const system = `You draft short, professional renewal-reminder emails for a software license reseller writing to their customer. Write in ${input.language}. Tone: ${input.tone}. Never invent facts beyond what's given. Keep it under 150 words. Output must be the email only — no commentary.`;
  const prompt = `Customer: ${input.customer}
Product: ${input.product}
Expiration date: ${input.expireDate}
Days remaining: ${input.daysRemaining}
Seats: ${input.seats ?? "unknown"}`;

  let succeeded = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const res = await ai.models.generateContent({
      model: DRAFT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { subject: { type: Type.STRING }, body: { type: Type.STRING } },
          required: ["subject", "body"],
        },
        temperature: 0.4,
      },
    });

    inputTokens = res.usageMetadata?.promptTokenCount ?? null;
    outputTokens = res.usageMetadata?.candidatesTokenCount ?? null;

    const parsed = DraftResult.parse(JSON.parse(res.text ?? "{}"));
    succeeded = true;
    return parsed;
  } finally {
    await logAiUsage({
      organizationId: orgId,
      userId,
      feature: "draft",
      model: DRAFT_MODEL,
      inputTokens,
      outputTokens,
      succeeded,
    });
  }
}

/* ---------- Feature D: suggest certificate fields from a PDF ---------- */

const AiCertResult = z.object({
  category: z.enum(["personal", "inspection"]).nullable().optional(),
  certType: z.string().nullable().optional(),
  holderName: z.string().nullable().optional(),
  certNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  expireDate: z.string().nullable().optional(),
  renewalMonths: z.number().int().nullable().optional(),
  confidence: z.number().min(0).max(1),
});
export type AiCertResult = z.infer<typeof AiCertResult>;

// Tried in order: on a transient failure (503 "high demand", or a 429 once the
// model's low daily quota is spent) that survives the per-model retries, the
// next model is tried. Each has its own separate quota, so the chain roughly
// triples the effective daily budget. All full "Flash" models (not Lite) to
// keep Thai-certificate reading quality consistent.
const CERT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

const CERT_TYPE_HINT = CERT_TYPE_PRESETS
  .map((p) => `- "${p.value}" = ${p.labelEn} (${p.category})`)
  .join("\n");

const CERT_SYSTEM = `You read ONE Thai or English safety / compliance certificate — either a training certificate held by a person, or a building / electrical inspection or fire-drill record — and extract its key fields for a form.

Known certificate types. If the document is one of these, return the Thai value EXACTLY as written here for certType, with the matching category:
${CERT_TYPE_HINT}
If it is none of these, return a short descriptive certType (Thai if the document is Thai) and your best category guess: "personal" if it certifies a named individual, "inspection" if it records a recurring site/building inspection or drill.

Rules:
- Extract ONLY what is literally present. Never invent a value; use null when unsure.
- holderName: the person the certificate is issued to. null for an inspection record with no individual.
- certNumber: the certificate / registration number as printed. null if none.
- Dates MUST be ISO 8601 YYYY-MM-DD in the Gregorian/CE calendar:
  * Thai certificates often print the Buddhist year (พ.ศ. / B.E.), which is 543 years AHEAD of CE. If a year is 2500 or greater, subtract 543 (e.g. พ.ศ. 2574 → 2031).
  * Thai dates like "19 ส.ค. 2574" or "19/08/2574" are day-month-year.
- issueDate: when it was issued or the training was completed. expireDate: the printed expiry/valid-until date, if any.
- renewalMonths: the stated validity period in months (e.g. "valid 5 years" → 60), else null.
- confidence: 0..1 for the overall extraction.`;

const CERT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: ["personal", "inspection"], nullable: true },
    certType: { type: Type.STRING, nullable: true },
    holderName: { type: Type.STRING, nullable: true },
    certNumber: { type: Type.STRING, nullable: true },
    issueDate: { type: Type.STRING, nullable: true, description: "ISO 8601 YYYY-MM-DD (CE), or null" },
    expireDate: { type: Type.STRING, nullable: true, description: "ISO 8601 YYYY-MM-DD (CE), or null" },
    renewalMonths: { type: Type.INTEGER, nullable: true },
    confidence: { type: Type.NUMBER, description: "0..1" },
  },
  required: ["confidence"],
};

/** Drops a date the model misread (wrong format, or a decade+ out of range) to
 *  null rather than pre-filling the form with a wrong value the user might miss. */
function cleanCertDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 40 || year > thisYear + 40) return null;
  return value;
}

/** A temporary Gemini capacity/transport error (503 "high demand", 429, 5xx)
 *  — worth a quick retry, unlike a 400/404 or a bad API key, which won't heal. */
const TRANSIENT_AI_ERROR = /\b(429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED)\b|overload|high demand/i;

function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_AI_ERROR.test(msg);
}

/** Retries `fn` on a transient error with exponential backoff (700ms, 1.4s).
 *  A single 503 spike resolves on the next attempt most of the time; a
 *  non-transient error (bad key, invalid request) is thrown immediately. */
async function withAiRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientAiError(err) || i === tries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** i));
    }
  }
  throw lastErr;
}

/**
 * Runs the cert extraction across CERT_MODELS in order. Each model gets its own
 * retry budget; a transient failure falls through to the next model, while a
 * real error (bad request, bad key) throws at once since another model won't
 * fix it. Returns which model actually answered, for the usage ledger.
 */
async function generateCertWithFallback(ai: GoogleGenAI, base64: string) {
  const contents = [{
    role: "user" as const,
    parts: [
      { inlineData: { mimeType: "application/pdf", data: base64 } },
      { text: "Extract the certificate fields from this document." },
    ],
  }];
  const config = {
    systemInstruction: CERT_SYSTEM,
    responseMimeType: "application/json",
    responseSchema: CERT_RESPONSE_SCHEMA,
    temperature: 0,
  };

  let lastErr: unknown;
  for (const model of CERT_MODELS) {
    try {
      const res = await withAiRetry(() => ai.models.generateContent({ model, contents, config }));
      return { res, model };
    } catch (err) {
      lastErr = err;
      if (!isTransientAiError(err)) throw err; // not a capacity problem — the next model won't help
    }
  }
  throw lastErr;
}

/**
 * Reads a certificate PDF with Gemini and returns suggested form fields. The PDF
 * is sent inline (not text-extracted) so Thai glyphs that pdf.js can't map are
 * still read. The result only pre-fills the form — the user reviews and edits
 * every field before saving; nothing is trusted or written directly.
 */
export async function aiExtractCertificate(
  orgId: string,
  userId: string,
  pdfBytes: Uint8Array,
): Promise<AiCertResult> {
  await assertAiQuota(orgId);

  const { GEMINI_API_KEY } = getEnv();
  if (!GEMINI_API_KEY) {
    throw new Error("PDF auto-fill isn't configured for this deployment (GEMINI_API_KEY missing).");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const base64 = Buffer.from(pdfBytes).toString("base64");

  let succeeded = false;
  let usedModel = CERT_MODELS[0];
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const { res, model } = await generateCertWithFallback(ai, base64);
    usedModel = model;
    inputTokens = res.usageMetadata?.promptTokenCount ?? null;
    outputTokens = res.usageMetadata?.candidatesTokenCount ?? null;

    const parsed = AiCertResult.parse(JSON.parse(res.text ?? "{}"));
    succeeded = true;
    return {
      ...parsed,
      issueDate: cleanCertDate(parsed.issueDate),
      expireDate: cleanCertDate(parsed.expireDate),
    };
  } finally {
    // feature "parse" is reused for the quota/usage ledger — the same per-org
    // monthly AI budget that governs license parsing covers cert auto-fill.
    // Logs whichever model in the fallback chain actually answered.
    await logAiUsage({
      organizationId: orgId,
      userId,
      feature: "parse",
      model: usedModel,
      inputTokens,
      outputTokens,
      succeeded,
    });
  }
}
