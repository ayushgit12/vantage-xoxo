import {
  DashboardCardsSkeleton,
  TableRowsSkeleton,
  TopNavSkeleton,
} from "@/components/ui/app-skeletons";

export default function Loading() {
  return (
    <div className="min-h-screen bg-transparent">
      <TopNavSkeleton />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="space-y-3">
          <div className="skeleton-base h-8 w-60 rounded-lg" />
          <div className="skeleton-base h-4 w-96 max-w-full rounded-md" />
        </div>
        <DashboardCardsSkeleton />
        <TableRowsSkeleton rows={7} />
      </div>
    </div>
  );
}
