"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listGoals, type Goal } from "@/lib/api";
import { Calendar, Clock, ArrowRight, Target, Flame, BookOpen, FolderKanban } from "lucide-react";

const priorityColor: Record<string, string> = {
  high: "text-red-400 bg-red-500/15 border-red-500/20",
  medium: "text-amber-400 bg-amber-500/15 border-amber-500/20",
  low: "text-emerald-400 bg-emerald-500/15 border-emerald-500/20",
};

const statusColor: Record<string, string> = {
  active: "text-cyan-300 bg-cyan-500/15 border-cyan-500/20",
  completed: "text-emerald-300 bg-emerald-500/15 border-emerald-500/20",
  paused: "text-amber-300 bg-amber-500/15 border-amber-500/20",
  archived: "text-slate-400 bg-slate-500/15 border-slate-500/20",
};

const typeIcon: Record<string, React.ReactNode> = {
  learning: <BookOpen className="h-4 w-4" />,
  habit: <Flame className="h-4 w-4" />,
  project: <FolderKanban className="h-4 w-4" />,
};

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-1">Timeline</p>
        <h1 className="text-3xl font-bold text-cyan-50">Goals History</h1>
        <p className="mt-1 text-sm text-slate-400">A timeline of every goal you&apos;ve created.</p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap gap-2">
        {["all", "active", "completed", "paused", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
              filter === s
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "border border-white/[0.08] bg-white/[0.02] text-slate-500 hover:bg-white/[0.04]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400">No goals found.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
                <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider">
                  {group.label}
                </h2>
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-xs text-slate-600">{group.goals.length} goal{group.goals.length > 1 ? "s" : ""}</span>
              </div>

              {/* Timeline line + cards */}
              <div className="ml-[5px] border-l border-white/[0.06] pl-7 space-y-4">
                {group.goals.map((goal) => (
                  <Link
                    key={goal.goal_id}
                    href={`/goals/history/${goal.goal_id}`}
                    className="group relative block glass-card p-5 hover:border-cyan-500/20 transition-all duration-200"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[33px] top-6 h-2 w-2 rounded-full bg-white/[0.15] group-hover:bg-cyan-400 transition" />

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {typeIcon[goal.goal_type || "learning"]}
                          <h3 className="text-base font-semibold text-cyan-50 truncate group-hover:text-cyan-300 transition">
                            {goal.title}
                          </h3>
                        </div>

                        {goal.description && (
                          <p className="text-sm text-slate-400 line-clamp-2 mb-3">{goal.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold capitalize ${statusColor[goal.status] || statusColor.active}`}>
                            {goal.status}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold capitalize ${priorityColor[goal.priority] || priorityColor.medium}`}>
                            {goal.priority}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Calendar className="h-3 w-3" />
                            Created {formatShortDate(goal.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Clock className="h-3 w-3" />
                            Due {formatShortDate(goal.deadline)}
                          </span>
                        </div>
                      </div>

                      <ArrowRight className="h-5 w-5 text-slate-600 group-hover:text-cyan-400 transition flex-shrink-0 mt-1" />
                    </div>
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
