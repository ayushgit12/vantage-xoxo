"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getGoal,
  getKnowledge,
  getPlanForGoal,
  type Goal,
  type GoalKnowledge,
  type Plan,
} from "@/lib/api";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  FolderKanban,
  Link2,
  Target,
} from "lucide-react";

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

const typeLabel: Record<string, { icon: React.ReactNode; label: string }> = {
  learning: { icon: <BookOpen className="h-4 w-4" />, label: "Learning" },
  habit: { icon: <Flame className="h-4 w-4" />, label: "Habit" },
  project: { icon: <FolderKanban className="h-4 w-4" />, label: "Project" },
};

function fmt(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShort(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function GoalHistoryDetail() {
  const params = useParams();
  const goalId = params.id as string;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [knowledge, setKnowledge] = useState<GoalKnowledge | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const g = await getGoal(goalId);
        setGoal(g);
        try {
          setKnowledge(await getKnowledge(goalId));
        } catch {}
        try {
          setPlan(await getPlanForGoal(goalId));
        } catch {}
      } catch {}
      setLoading(false);
    }
    load();
  }, [goalId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-slate-400">Goal not found.</p>
        <Link href="/goals/history" className="mt-4 inline-block text-cyan-400 hover:underline text-sm">
          Back to history
        </Link>
      </div>
    );
  }

  const t = typeLabel[goal.goal_type || "learning"] || typeLabel.learning;

  // Schedule stats
  const totalBlocks = plan?.micro_blocks?.length || 0;
  const doneBlocks = plan?.micro_blocks?.filter((b) => b.status === "done").length || 0;
  const totalMinutes = plan?.micro_blocks?.reduce((sum, b) => sum + b.duration_min, 0) || 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Back link */}
      <Link
        href="/goals/history"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-300 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to history
      </Link>

      {/* Hero card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-cyan-400">{t.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.label} Goal
              </span>
            </div>
            <h1 className="text-2xl font-bold text-cyan-50 mb-2">{goal.title}</h1>
            {goal.description && (
              <p className="text-sm text-slate-400 leading-relaxed">{goal.description}</p>
            )}
          </div>
          <Link
            href={`/goals/${goal.goal_id}`}
            className="flex-shrink-0 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
          >
            Open Dashboard
          </Link>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusColor[goal.status]}`}>
            {goal.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
            {goal.status}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${priorityColor[goal.priority]}`}>
            {goal.priority} priority
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs text-slate-400 capitalize">
            {goal.category}
          </span>
        </div>

        {/* Key dates */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Created", value: fmt(goal.created_at), icon: Calendar },
            { label: "Deadline", value: fmtShort(goal.deadline), icon: Target },
            { label: "Last Updated", value: fmt(goal.updated_at), icon: Clock },
            { label: "Completed", value: goal.completed_at ? fmt(goal.completed_at) : "—", icon: CheckCircle2 },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className="h-3 w-3 text-slate-600" />
                <span className="text-[10px] uppercase tracking-wider text-slate-600">{item.label}</span>
              </div>
              <p className="text-xs font-medium text-cyan-100">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {(knowledge || plan) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Topics", value: knowledge?.topics?.length || 0 },
            { label: "Est. Hours", value: knowledge?.estimated_total_hours?.toFixed(1) || "—" },
            { label: "Study Blocks", value: totalBlocks },
            { label: "Completed", value: `${doneBlocks}/${totalBlocks}` },
          ].map((s) => (
            <div key={s.label} className="glass-card px-4 py-3 text-center">
              <p className="text-lg font-bold text-cyan-300">{s.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Settings details */}
      <div className="glass-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider mb-3">Configuration</h2>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
            <span className="text-slate-500">Weekly Effort Target</span>
            <span className="text-cyan-100 font-medium">
              {goal.target_weekly_effort ? `${goal.target_weekly_effort}h` : "Auto"}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
            <span className="text-slate-500">User Materials Only</span>
            <span className="text-cyan-100 font-medium">{goal.prefer_user_materials_only ? "Yes" : "No"}</span>
          </div>
          {goal.preferred_schedule && (
            <>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-500">Preferred Start</span>
                <span className="text-cyan-100 font-medium">{goal.preferred_schedule.start_hour != null ? `${goal.preferred_schedule.start_hour}:00` : "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-500">Preferred End</span>
                <span className="text-cyan-100 font-medium">{goal.preferred_schedule.end_hour != null ? `${goal.preferred_schedule.end_hour}:00` : "—"}</span>
              </div>
            </>
          )}
          {goal.restricted_slots && goal.restricted_slots.length > 0 && (
            <div className="md:col-span-2 py-1.5 border-b border-white/[0.04]">
              <span className="text-slate-500">Restricted Slots</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {goal.restricted_slots.map((slot, i) => (
                  <span key={i} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-0.5 text-xs text-slate-400">
                    {slot.days?.map((d: number) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} {slot.start_hour}:00–{slot.end_hour}:00
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Material URLs */}
      {goal.material_urls.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider mb-3">Materials</h2>
          <div className="space-y-2">
            {goal.material_urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition truncate"
              >
                <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-600" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {knowledge && knowledge.topics.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider mb-3">
            Topics ({knowledge.topics.length})
          </h2>
          <div className="space-y-2">
            {knowledge.topics.map((topic) => {
              const topicBlocks = plan?.micro_blocks?.filter((b) => b.topic_id === topic.topic_id) || [];
              const done = topicBlocks.filter((b) => b.status === "done").length;
              return (
                <div
                  key={topic.topic_id}
                  className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cyan-100">{topic.title}</p>
                      {topic.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{topic.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                      <span>{topic.est_hours}h</span>
                      {topicBlocks.length > 0 && (
                        <span className="text-emerald-400">{done}/{topicBlocks.length} blocks</span>
                      )}
                    </div>
                  </div>
                  {topic.prereq_ids.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      Prereqs: {topic.prereq_ids.map((pid) => {
                        const p = knowledge.topics.find((t) => t.topic_id === pid);
                        return p?.title || pid.slice(0, 8);
                      }).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones */}
      {knowledge && knowledge.milestones.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider mb-3">
            Milestones ({knowledge.milestones.length})
          </h2>
          <div className="space-y-2">
            {knowledge.milestones.map((ms, i) => (
              <div key={i} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
                <p className="text-sm font-medium text-cyan-100">{ms.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ms.topic_ids.length} topic{ms.topic_ids.length !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule summary */}
      {plan && plan.micro_blocks.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="text-sm font-semibold text-cyan-200 uppercase tracking-wider mb-3">
            Schedule ({totalBlocks} blocks &middot; {Math.round(totalMinutes / 60)}h total)
          </h2>
          <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
            {plan.micro_blocks
              .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
              .map((block) => {
                const topic = knowledge?.topics.find((t) => t.topic_id === block.topic_id);
                const isDone = block.status === "done";
                return (
                  <div
                    key={block.block_id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                      isDone
                        ? "bg-emerald-500/5 border border-emerald-500/10"
                        : "bg-white/[0.02] border border-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isDone && <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
                      <span className={`truncate ${isDone ? "text-emerald-300" : "text-cyan-100"}`}>
                        {topic?.title || "Study"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 flex-shrink-0">
                      <span>{block.duration_min}min</span>
                      <span>{fmtShort(block.start_dt)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
