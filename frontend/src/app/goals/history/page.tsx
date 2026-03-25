"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listGoals, type Goal } from "@/lib/api";
import { Calendar, Clock, ArrowRight, Target, Flame, BookOpen, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableRowsSkeleton } from "@/components/ui/app-skeletons";

const priorityColor: Record<string, "destructive" | "outline" | "secondary"> = {
  high: "destructive",
  medium: "outline",
  low: "secondary",
};

const statusColor: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  completed: "secondary",
  paused: "outline",
  archived: "outline",
};

const typeIcon: Record<string, React.ReactNode> = {
  learning: <BookOpen className="h-4 w-4" />,
  habit: <Flame className="h-4 w-4" />,
  project: <FolderKanban className="h-4 w-4" />,
};

function formatShortDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupByMonth(goals: Goal[]): { label: string; goals: Goal[] }[] {
  const sorted = [...goals].sort(
    (a, b) => new Date(b.created_at || b.deadline).getTime() - new Date(a.created_at || a.deadline).getTime()
  );
  const groups: Map<string, Goal[]> = new Map();
  for (const g of sorted) {
    const d = new Date(g.created_at || g.deadline);
    const key = `${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return Array.from(groups.entries()).map(([label, goals]) => ({ label, goals }));
}

export default function GoalsHistoryPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    listGoals()
      .then(setGoals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? goals : goals.filter((g) => g.status === filter);
  const groups = groupByMonth(filtered);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">Timeline</p>
        <h1 className="text-3xl font-bold text-zinc-900">Goals History</h1>
        <p className="mt-1 text-sm text-zinc-600">A timeline of every goal you&apos;ve created.</p>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {["all", "active", "completed", "paused", "archived"].map((s) => (
          <Button
            key={s}
            onClick={() => setFilter(s)}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            className="rounded-full capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <TableRowsSkeleton rows={6} />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <CardContent>
            <Target className="mx-auto mb-3 h-10 w-10 text-zinc-500" />
            <p className="text-zinc-600">No goals found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-900" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                  {group.label}
                </h2>
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-xs text-zinc-500">{group.goals.length} goal{group.goals.length > 1 ? "s" : ""}</span>
              </div>

              <div className="ml-[5px] space-y-4 border-l border-zinc-200 pl-7">
                {group.goals.map((goal) => (
                  <Link
                    key={goal.goal_id}
                    href={`/goals/history/${goal.goal_id}`}
                    className="group relative block"
                  >
                    <Card className="border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="p-0">
                        <div className="absolute -left-[33px] top-6 h-2 w-2 rounded-full bg-zinc-300 transition group-hover:bg-zinc-800" />

                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="text-zinc-500">{typeIcon[goal.goal_type || "learning"]}</span>
                              <h3 className="truncate text-base font-semibold text-zinc-900 transition group-hover:text-zinc-700">
                                {goal.title}
                              </h3>
                            </div>

                            {goal.description && (
                              <p className="mb-3 line-clamp-2 text-sm text-zinc-600">{goal.description}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              <Badge variant={statusColor[goal.status] || statusColor.active} className="capitalize">
                                {goal.status}
                              </Badge>
                              <Badge variant={priorityColor[goal.priority] || priorityColor.medium} className="capitalize">
                                {goal.priority}
                              </Badge>
                              <span className="inline-flex items-center gap-1 text-zinc-500">
                                <Calendar className="h-3 w-3" />
                                Created {formatShortDate(goal.created_at)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-zinc-500">
                                <Clock className="h-3 w-3" />
                                Due {formatShortDate(goal.deadline)}
                              </span>
                            </div>
                          </div>

                          <ArrowRight className="mt-1 h-5 w-5 flex-shrink-0 text-zinc-400 transition group-hover:text-zinc-700" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
