import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { countAiCallsThisMonth, logAiUsage } from "@/server/data/aiUsage";
import { getActiveSubscription } from "@/server/data/subscriptions";

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

const AiParsedLicense = z.object({
  productName: z.string(),
  vendor: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  licenseKey: z.string().nullable().optional(),
  expireDate: z.string().nullable().optional(),
  seats: z.number().int().nullable().optional(),
  status: z.enum(["ACTIVE", "PERPETUAL", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
});

const AiParseResult = z.object({
  licenses: z.array(AiParsedLicense),
  formatGuess: z.string(),
  notes: z.string().nullable().optional(),
});

export type AiParsedLicense = z.infer<typeof AiParsedLicense>;
export type AiParseResult = z.infer<typeof AiParseResult>;

const PARSE_MODEL = "gemini-2.5-flash";

const PARSE_SYSTEM = `You extract software license entitlements from license files.

Rules:
- Extract ONLY what is literally present. Never infer or guess a date.
- If an expiry date is absent or the license is permanent/perpetual, set
  expireDate to null and status to PERPETUAL.
- If you cannot determine a field, use null. Do not substitute a plausible value.
- Ambiguous or unreadable date -> expireDate null, status UNKNOWN, confidence < 0.5.
- Dates like "31-dec-2026" are day-month-year. Convert to 2026-12-31.
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

  const licenses = result.licenses.filter((lic) => {
    if (lic.expireDate) {
      const match = /^(\d{4})-\d{2}-\d{2}$/.exec(lic.expireDate);
      if (!match) return false;
      const year = Number(match[1]);
      if (year < minYear || year > maxYear) return false;
    }
    if (lic.seats != null && lic.seats < 0) return false;
    return true;
  });

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

const DRAFT_MODEL = "gemini-2.5-flash";

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
