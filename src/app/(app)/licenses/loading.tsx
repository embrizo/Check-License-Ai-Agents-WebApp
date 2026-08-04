import { Skeleton } from "@/components/ui/skeleton";

export default function LicensesLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-9 w-full max-w-xs" />
      <div className="space-y-2 rounded-md border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
