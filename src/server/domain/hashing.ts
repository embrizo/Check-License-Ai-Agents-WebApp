import { createHash } from "node:crypto";

/** Port of engine/scanner/hashing.py — sha256 of file content, used to skip re-parsing unchanged uploads. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
