import { Skeleton } from "@/components/ui/skeleton";

export function TopNavSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/90 px-6 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-7 rounded-lg" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="hidden md:flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

export function DashboardCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 grid grid-cols-12 gap-3">
        <Skeleton className="col-span-4 h-4" />
        <Skeleton className="col-span-3 h-4" />
        <Skeleton className="col-span-3 h-4" />
        <Skeleton className="col-span-2 h-4" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-3">
            <Skeleton className="col-span-4 h-5" />
            <Skeleton className="col-span-3 h-5" />
            <Skeleton className="col-span-3 h-5" />
            <Skeleton className="col-span-2 h-5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSectionSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-40" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full sm:col-span-2" />
      </div>
      <Skeleton className="mt-6 h-10 w-28" />
    </div>
  );
}
