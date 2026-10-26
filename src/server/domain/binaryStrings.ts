/**
 * Pull the printable-ASCII runs out of a binary blob — the moral equivalent of
 * the Unix `strings` command. Pure, no I/O (bytes in, strings out), so it's
 * unit-testable without touching disk.
 *
 * Used to make a FlexNet "capability response" (`.bin`) readable: the file is
 * binary and signed, but its feature names, dates, product and customer fields
 * are plain ASCII, and that's everything the capability parser needs.
 */
export function extractPrintableStrings(bytes: Uint8Array, minLen = 4): string[] {
  const out: string[] = [];
  let run = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 0x20 && c < 0x7f) {
      run += String.fromCharCode(c);
    } else {
      if (run.length >= minLen) out.push(run);
      run = "";
    }
  }
  if (run.length >= minLen) out.push(run);
  return out;
}
