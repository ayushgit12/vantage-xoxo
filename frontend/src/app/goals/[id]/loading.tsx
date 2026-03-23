import { Skeleton } from "@/components/ui/skeleton";

export default function GoalDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[560px] w-full rounded-xl" />
        <Skeleton className="h-[560px] w-full rounded-xl" />
      </div>
    </div>
  );
}
