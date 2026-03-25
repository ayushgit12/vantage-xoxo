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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCardsSkeleton, TableRowsSkeleton } from "@/components/ui/app-skeletons";

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
    void load();
  }, [goalId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <DashboardCardsSkeleton />
        <TableRowsSkeleton rows={8} />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-zinc-600">Goal not found.</p>
        <Button asChild variant="link" className="mt-2 h-auto p-0 text-zinc-700">
          <Link href="/goals/history">Back to history</Link>
        </Button>
      </div>
    );
  }

  const t = typeLabel[goal.goal_type || "learning"] || typeLabel.learning;

  // Schedule stats
  const totalBlocks = plan?.micro_blocks?.length || 0;
  const doneBlocks = plan?.micro_blocks?.filter((b) => b.status === "done").length || 0;
  const totalMinutes = plan?.micro_blocks?.reduce((sum, b) => sum + b.duration_min, 0) || 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/goals/history"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to history
      </Link>

      <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
        <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-zinc-600">{t.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t.label} Goal
              </span>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-zinc-900">{goal.title}</h1>
            {goal.description && (
              <p className="text-sm leading-relaxed text-zinc-600">{goal.description}</p>
            )}
          </div>
          <Button asChild variant="outline" size="sm" className="flex-shrink-0">
            <Link href={`/goals/${goal.goal_id}`}>Open Dashboard</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant={statusColor[goal.status]} className="capitalize">
            {goal.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
            {goal.status}
          </Badge>
          <Badge variant={priorityColor[goal.priority]} className="capitalize">
            {goal.priority} priority
          </Badge>
          <Badge variant="outline" className="capitalize">
            {goal.category}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Created", value: fmt(goal.created_at), icon: Calendar },
            { label: "Deadline", value: fmtShort(goal.deadline), icon: Target },
            { label: "Last Updated", value: fmt(goal.updated_at), icon: Clock },
            { label: "Completed", value: goal.completed_at ? fmt(goal.completed_at) : "—", icon: CheckCircle2 },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className="h-3 w-3 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{item.label}</span>
              </div>
              <p className="text-xs font-medium text-zinc-900">{item.value}</p>
            </div>
          ))}
        </div>
        </CardContent>
      </Card>

      {(knowledge || plan) && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Topics", value: knowledge?.topics?.length || 0 },
            { label: "Est. Hours", value: knowledge?.estimated_total_hours?.toFixed(1) || "—" },
            { label: "Study Blocks", value: totalBlocks },
            { label: "Completed", value: `${doneBlocks}/${totalBlocks}` },
          ].map((s) => (
            <Card key={s.label} className="border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm">
              <CardContent className="p-0">
                <p className="text-lg font-bold text-zinc-900">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-zinc-700">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between border-b border-zinc-200 py-1.5">
            <span className="text-zinc-500">Weekly Effort Target</span>
            <span className="font-medium text-zinc-900">
              {goal.target_weekly_effort ? `${goal.target_weekly_effort}h` : "Auto"}
            </span>
          </div>
          <div className="flex justify-between border-b border-zinc-200 py-1.5">
            <span className="text-zinc-500">User Materials Only</span>
            <span className="font-medium text-zinc-900">{goal.prefer_user_materials_only ? "Yes" : "No"}</span>
          </div>
          {goal.preferred_schedule && (
            <>
              <div className="flex justify-between border-b border-zinc-200 py-1.5">
                <span className="text-zinc-500">Preferred Start</span>
                <span className="font-medium text-zinc-900">{goal.preferred_schedule.start_hour != null ? `${goal.preferred_schedule.start_hour}:00` : "—"}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-200 py-1.5">
                <span className="text-zinc-500">Preferred End</span>
                <span className="font-medium text-zinc-900">{goal.preferred_schedule.end_hour != null ? `${goal.preferred_schedule.end_hour}:00` : "—"}</span>
              </div>
            </>
          )}
          {goal.restricted_slots && goal.restricted_slots.length > 0 && (
            <div className="md:col-span-2 border-b border-zinc-200 py-1.5">
              <span className="text-zinc-500">Restricted Slots</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {goal.restricted_slots.map((slot, i) => (
                  <Badge key={i} variant="outline" className="rounded-full">
                    {slot.days?.map((d: number) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} {slot.start_hour}:00–{slot.end_hour}:00
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {goal.material_urls.length > 0 && (
        <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-zinc-700">Materials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {goal.material_urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 truncate text-sm text-zinc-700 transition hover:text-zinc-900"
              >
                <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-zinc-500" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {knowledge && knowledge.topics.length > 0 && (
        <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-zinc-700">
            Topics ({knowledge.topics.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {knowledge.topics.map((topic) => {
              const topicBlocks = plan?.micro_blocks?.filter((b) => b.topic_id === topic.topic_id) || [];
              const done = topicBlocks.filter((b) => b.status === "done").length;
              return (
                <div
                  key={topic.topic_id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{topic.title}</p>
                      {topic.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{topic.description}</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3 text-xs text-zinc-500">
                      <span>{topic.est_hours}h</span>
                      {topicBlocks.length > 0 && (
                        <span className="text-zinc-700">{done}/{topicBlocks.length} blocks</span>
                      )}
                    </div>
                  </div>
                  {topic.prereq_ids.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      Prereqs: {topic.prereq_ids.map((pid) => {
                        const p = knowledge.topics.find((t) => t.topic_id === pid);
                        return p?.title || pid.slice(0, 8);
                      }).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {knowledge && knowledge.milestones.length > 0 && (
        <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-zinc-700">
            Milestones ({knowledge.milestones.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {knowledge.milestones.map((ms, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-sm font-medium text-zinc-900">{ms.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {ms.topic_ids.length} topic{ms.topic_ids.length !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {plan && plan.micro_blocks.length > 0 && (
        <Card className="mb-6 border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-zinc-700">
            Schedule ({totalBlocks} blocks &middot; {Math.round(totalMinutes / 60)}h total)
            </CardTitle>
            <CardDescription>Chronological execution summary</CardDescription>
          </CardHeader>
          <CardContent className="max-h-72 space-y-1.5 overflow-y-auto no-scrollbar">
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
                        ? "border border-zinc-300 bg-zinc-100"
                        : "border border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isDone && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-zinc-700" />}
                      <span className={`truncate ${isDone ? "text-zinc-800" : "text-zinc-700"}`}>
                        {topic?.title || "Study"}
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3 text-zinc-500">
                      <span>{block.duration_min}min</span>
                      <span>{fmtShort(block.start_dt)}</span>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
