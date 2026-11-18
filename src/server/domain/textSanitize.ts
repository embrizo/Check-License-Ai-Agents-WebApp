/**
 * Strip characters a Postgres text column can't store — chiefly the NUL byte
 * (U+0000), which aborts an INSERT with `invalid byte sequence for encoding
 * "UTF8": 0x00`. pdf.js emits U+0000 for glyphs it can't map (common with Thai
 * and other complex scripts), so text extracted from a perfectly ordinary PDF
 * routinely carries stray NULs. Without this, uploading such a PDF throws deep
 * in the upsert and surfaces to the user as a bare "Something went wrong".
 *
 * We also drop the other C0 control characters (keeping only tab, newline and
 * carriage return): they're never meaningful license text and only add noise to
 * the FlexLM line parser and the content hash.
 *
 * Pure (string in, string out), so it's unit-testable without a real PDF. The
 * plain-text upload path already rejects NUL up front via `buffer.includes(0)`;
 * this is the equivalent safeguard for text that arrives already decoded (PDF
 * extraction), where cleaning beats rejecting — the file still stores and the
 * user can run AI parse on it.
 */
export function stripUnstorableChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}
