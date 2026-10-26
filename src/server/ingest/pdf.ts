import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Turn an uploaded PDF into plain text so the rest of the ingest pipeline —
 * the FlexLM parser first, then the AI parse fallback (docs/05 Feature A) —
 * can treat it exactly like a `.txt` upload. unpdf bundles a serverless build
 * of pdf.js (no `canvas`, no native deps), so it runs unchanged on the Node
 * serverless runtime the app deploys to.
 *
 * Pure in the no-I/O sense: bytes in, text out, no DB or network. Returns the
 * extracted text trimmed; an empty string means a text layer couldn't be found
 * (e.g. a scanned-image PDF) and the caller surfaces that rather than storing
 * an empty file.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}
