"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { QuizModal } from "@/components/QuizModal";

import {
  deleteGoal,
  getKnowledge,
  getPlanForGoal,
  listGoals,
  type Goal,
  type MicroBlock,
  type Plan,
  updateBlockStatus,
} from "@/lib/api";
import {
  computeBlockProgress,
  getDefaultSelectedDate,
  getSortedDates,
  groupBlocksByDate,
  parseDateKey,
} from "@/lib/schedule";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface GlobalBlock extends MicroBlock {
  goalTitle: string;
  topicTitle: string;
}

type GoalFilter = "all" | "active" | "ready" | "paused";

function formatDurationBadge(durationMin: number): string {
  if (durationMin < 60) return `${durationMin}m`;
  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getStatusPill(status: string): string {
  if (status === "active") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "paused") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "completed") return "bg-zinc-200 text-zinc-700 border-zinc-300";
  if (status === "archived") return "bg-zinc-200 text-zinc-700 border-zinc-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

export default function AllGoalsDashboard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockActionId, setBlockActionId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("all");
  const [quizOpen, setQuizOpen] = useState(false);

  const [globalBlocks, setGlobalBlocks] = useState<GlobalBlock[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const allGoals = await listGoals();
      setGoals(allGoals);

      const scheduledGoals = allGoals.filter(
        (goal) => goal.status === "active" && goal.active_plan_id
      );

      const planPromises = scheduledGoals.map((g) => getPlanForGoal(g.goal_id).catch(() => null));
      const knowledgePromises = allGoals
        .filter((g) => g.knowledge_id)
        .map((g) => getKnowledge(g.goal_id).catch(() => null));

      const plansResp = await Promise.all(planPromises);
      const knowledgeResp = await Promise.all(knowledgePromises);

      const validPlans = plansResp.filter((p): p is Plan => p !== null);

      const topicMap: Record<string, string> = {};
      knowledgeResp.forEach((k) => {
        if (!k) return;
        k.topics.forEach((t) => {
          topicMap[t.topic_id] = t.title;
        });
      });

      let mergedBlocks: GlobalBlock[] = [];
      validPlans.forEach((plan) => {
        const parentGoal = scheduledGoals.find((g) => g.goal_id === plan.goal_id);
        const goalTitle = parentGoal?.title || "Unknown Goal";

        mergedBlocks = mergedBlocks.concat(
          plan.micro_blocks.map((b) => ({
            ...b,
            goalTitle,
            topicTitle: topicMap[b.topic_id] || `Topic ${b.topic_id.slice(0, 8)}`,
          }))
        );
      });

      mergedBlocks.sort(
        (a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime()
      );
      setGlobalBlocks(mergedBlocks);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(blockId: string, status: string) {
    setBlockError(null);
    setBlockActionId(blockId);
    const previousBlocks = globalBlocks;

    try {
      setGlobalBlocks((prev) =>
        prev.map((b) => (b.block_id === blockId ? { ...b, status } : b))
      );
      await updateBlockStatus(blockId, status);

      if (status === "missed" || status === "partial") {
        await loadData();
      }
    } catch (error) {
      console.error(error);
      setGlobalBlocks(previousBlocks);
      setBlockError(
        error instanceof Error ? error.message : "Failed to update block status."
      );
      await loadData();
    } finally {
      setBlockActionId(null);
    }
  }

  async function handleDeleteGoal(goalId: string, title: string) {
    if (!window.confirm(`Delete goal "${title}"? This cannot be undone.`)) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteGoal(goalId);
      await loadData();
    } catch (error) {
      console.error(error);
      alert("Failed to delete goal.");
    } finally {
      setActionLoading(false);
    }
  }

  const blocksByDate = useMemo(() => groupBlocksByDate(globalBlocks), [globalBlocks]);
  const availableDates = useMemo(() => getSortedDates(blocksByDate), [blocksByDate]);

  useEffect(() => {
    setSelectedDate((current) => {
      if (current && availableDates.includes(current)) return current;
      return getDefaultSelectedDate(availableDates);
    });
  }, [availableDates]);

  const selectedIndex = selectedDate ? availableDates.indexOf(selectedDate) : -1;

  function goPrevDate() {
    if (selectedIndex > 0) {
      setSelectedDate(availableDates[selectedIndex - 1]);
    }
  }

  function goNextDate() {
    if (selectedIndex >= 0 && selectedIndex < availableDates.length - 1) {
      setSelectedDate(availableDates[selectedIndex + 1]);
    }
  }

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatDateHeader(dateStr: string) {
    const d = parseDateKey(dateStr);
    return {
      dayOfWeek: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayOfMonth: d.getDate(),
      long: d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }

  function isTodayDate(dateStr: string) {
    const d = parseDateKey(dateStr);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
    );
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  const readyGoals = goals.filter((g) => g.knowledge_id && !g.active_plan_id && g.status !== "archived");
  const pausedGoals = goals.filter((g) => g.status === "paused");

  const filteredGoals = goals
    .filter((goal) => goal.status !== "completed" && goal.status !== "archived")
    .filter((goal) => {
      if (goalFilter === "all") return true;
      if (goalFilter === "active") return goal.status === "active";
      if (goalFilter === "paused") return goal.status === "paused";
      if (goalFilter === "ready") return Boolean(goal.knowledge_id && !goal.active_plan_id);
      return true;
    });

  function getGoalProgress(goalId: string) {
    const goalBlocks = globalBlocks.filter((block) => block.goal_id === goalId);
    if (goalBlocks.length === 0) return 0;
    return computeBlockProgress(goalBlocks).progressPct;
  }

  const selectedDateBlocks = selectedDate ? blocksByDate[selectedDate] || [] : [];

  const visibleDateChips = useMemo(() => {
    if (!availableDates.length) return [] as string[];
    if (selectedIndex < 0 || availableDates.length <= 7) return availableDates;
    const start = Math.max(0, selectedIndex - 3);
    const end = Math.min(availableDates.length, start + 7);
    return availableDates.slice(start, end);
  }, [availableDates, selectedIndex]);

  if (loading && goals.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Dashboard
          </p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-950">Goals Command Center</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Track active goals, update block outcomes, and monitor progress in one view.
          </p>
        </div>
        <Button asChild className="h-10 bg-zinc-900 px-5 text-white hover:bg-zinc-800">
          <Link href="/goals/new">+ New Goal</Link>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex lg:flex-col">
            <h2 className="text-sm font-semibold text-zinc-900">Overview</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2">
                <span className="text-zinc-600">Active</span>
                <span className="font-semibold text-zinc-900">{activeGoals.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2">
                <span className="text-zinc-600">Ready to plan</span>
                <span className="font-semibold text-zinc-900">{readyGoals.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2">
                <span className="text-zinc-600">Paused</span>
                <span className="font-semibold text-zinc-900">{pausedGoals.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2.5 py-2">
                <span className="text-zinc-600">Scheduled blocks</span>
                <span className="font-semibold text-zinc-900">{globalBlocks.length}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex lg:h-[420px] lg:flex-col">
            <h2 className="text-sm font-semibold text-zinc-900">Filter Goals</h2>
            <div className="mt-3">
              <Select value={goalFilter} onValueChange={(value) => setGoalFilter(value as GoalFilter)}>
                <SelectTrigger className="h-9 border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" position="popper" className="w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ready">Ready to plan</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </aside>

        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-zinc-600" />
                <h2 className="text-sm font-semibold text-zinc-900">Master Calendar</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 hover:from-indigo-100 hover:to-purple-100 hover:text-indigo-800 font-semibold shadow-sm transition-all duration-200 hover:shadow-md"
                  onClick={() => setQuizOpen(true)}
                  disabled={!selectedDate || selectedDateBlocks.length === 0}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Create Quiz
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="border-zinc-300 bg-white"
                    onClick={goPrevDate}
                    disabled={selectedIndex <= 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="border-zinc-300 bg-white"
                    onClick={goNextDate}
                    disabled={selectedIndex < 0 || selectedIndex >= availableDates.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {blockError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {blockError}
              </div>
            ) : null}

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {visibleDateChips.length > 0 ? (
                visibleDateChips.map((dateStr) => {
                  const { dayOfWeek, dayOfMonth } = formatDateHeader(dateStr);
                  const isSelected = selectedDate === dateStr;
                  const isToday = isTodayDate(dateStr);
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(dateStr)}
                      className={`min-w-[68px] rounded-lg border px-2 py-2 text-center transition ${
                        isSelected
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {isToday ? (
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
                          Today
                        </p>
                      ) : null}
                      <p className="text-[10px] font-semibold uppercase tracking-wider">{dayOfWeek}</p>
                      <p className="mt-0.5 text-base font-bold">{dayOfMonth}</p>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500">No scheduled dates yet.</p>
              )}
            </div>

            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 no-scrollbar">
              {selectedDateBlocks.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                  No blocks for this date.
                </div>
              ) : (
                selectedDateBlocks.map((block) => {
                  const isDone = block.status === "done";
                  const isPartial = block.status === "partial";
                  const isMissed = block.status === "missed";
                  const blockTone = isDone
                    ? "border-emerald-200 bg-emerald-50"
                    : isMissed
                    ? "border-rose-200 bg-rose-50"
                    : isPartial
                    ? "border-amber-200 bg-amber-50"
                    : "border-zinc-200 bg-zinc-50";

                  return (
                    <div
                      key={block.block_id}
                      className={`rounded-lg border px-3 py-3 ${blockTone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                            {formatTime(block.start_dt)}
                          </p>
                          <p className={`mt-1 text-sm font-semibold text-zinc-900 ${isDone ? "line-through opacity-70" : ""}`}>
                            {block.topicTitle}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                            <span className="rounded bg-white px-1.5 py-0.5 font-medium">{formatDurationBadge(block.duration_min)}</span>
                            <span>{block.goalTitle}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {block.status === "scheduled" ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-emerald-600 hover:bg-emerald-50"
                                disabled={blockActionId === block.block_id}
                                onClick={() => handleStatusChange(block.block_id, "done")}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-rose-600 hover:bg-rose-50"
                                disabled={blockActionId === block.block_id}
                                onClick={() => handleStatusChange(block.block_id, "missed")}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                          {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                          {isPartial ? <Clock3 className="h-4 w-4 text-amber-600" /> : null}
                          {isMissed ? <AlertTriangle className="h-4 w-4 text-rose-600" /> : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">Goals</h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                {filteredGoals.length}
              </span>
            </div>

            {filteredGoals.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                No goals match this filter.
              </div>
            ) : (
              <div className="h-[230px] overflow-x-auto overflow-y-auto pr-1 no-scrollbar">
                <table className="w-full min-w-[760px] border-separate border-spacing-y-2">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-white text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-2">Goal</th>
                      <th className="px-2">Status</th>
                      <th className="px-2">Deadline</th>
                      <th className="px-2">Progress</th>
                      <th className="px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGoals.map((goal) => {
                      const daysLeft = Math.max(
                        0,
                        Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      );
                      const progress = getGoalProgress(goal.goal_id);

                      return (
                        <tr key={goal.goal_id} className="rounded-lg bg-zinc-50 text-sm">
                          <td className="rounded-l-lg px-2 py-3">
                            <div>
                              <p className="font-semibold text-zinc-900">{goal.title}</p>
                              <p className="text-xs text-zinc-500">
                                {goal.category} · {goal.priority}
                              </p>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${getStatusPill(goal.status)}`}>
                              {goal.status}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-zinc-700">{daysLeft} days</td>
                          <td className="px-2 py-3">
                            {goal.active_plan_id ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
                                  <div className="h-full rounded-full bg-zinc-800" style={{ width: `${progress}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-zinc-700">{progress}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-500">Not planned</span>
                            )}
                          </td>
                          <td className="rounded-r-lg px-2 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button asChild variant="outline" size="sm" className="border-zinc-300 bg-white">
                                <Link href={`/goals/${goal.goal_id}`}>Open</Link>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => handleDeleteGoal(goal.goal_id, goal.title)}
                                disabled={actionLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      <QuizModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        selectedDate={selectedDate}
      />
    </div>
  );
}
