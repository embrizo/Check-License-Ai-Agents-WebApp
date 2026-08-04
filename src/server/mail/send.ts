import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";

const FROM_ADDRESS = "License Alerts <alerts@mat.co.th>"; // update once the domain is DKIM/SPF-verified in Resend (docs/01 D8)

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** Only set on sends a specific user personally triggers — see docs/01 D8 and docs/04 §5a. Automated cron sends omit this. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  providerMessageId: string | null;
  error?: string;
}

let cachedClient: Resend | null = null;

/**
 * Resend HTTP API (D8) — not SMTP. When RESEND_API_KEY isn't configured
 * (local dev before the key is issued), falls back to a dummy mode that
 * logs instead of sending, mirroring the desktop's SMTP_HOST ===
 * "smtp.example.com" dummy branch in engine/alerts/mailer.py. This keeps
 * the whole alert pipeline runnable end-to-end without a live provider key.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (input.to.length === 0) {
    return { ok: false, providerMessageId: null, error: "No recipients" };
  }

  const { RESEND_API_KEY } = getEnv();
  if (!RESEND_API_KEY) {
    console.log(`[DUMMY MAIL MODE] Would send to ${input.to.join(", ")}`);
    console.log(`Subject: ${input.subject}\n${input.text}`);
    return { ok: true, providerMessageId: `dummy-${Date.now()}` };
  }

  cachedClient ??= new Resend(RESEND_API_KEY);

  try {
    const { data, error } = await cachedClient.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    if (error) return { ok: false, providerMessageId: null, error: error.message };
    return { ok: true, providerMessageId: data?.id ?? null };
  } catch (err) {
    return { ok: false, providerMessageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}
