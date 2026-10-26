import type { LicenseMetadata } from "@/db/schema";

/**
 * Renders the extra identifiers an AI parse captured into licenses.metadata
 * (e.g. a Kepware PDF's Emergency Activation ID, Hardware Key ID, Cert
 * Required). Shown under the product name so a reviewer can check them against
 * the source before confirming. Renders nothing when there are none.
 */
export function LicenseAttributes({ metadata }: { metadata: LicenseMetadata | null }) {
  const attributes = metadata?.attributes ?? [];
  if (attributes.length === 0) return null;

  return (
    <dl className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {attributes.map((a, i) => (
        <div key={`${a.label}-${i}`} className="flex gap-1">
          <dt className="font-medium">{a.label}:</dt>
          <dd className="break-all">{a.value}</dd>
        </div>
      ))}
    </dl>
  );
}
