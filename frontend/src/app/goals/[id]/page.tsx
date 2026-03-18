"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  addKnowledgeTopic,
  deleteKnowledgeTopic,
  getGoal,
  getKnowledge,
  getPlanForGoal,
  replanAllPlans,
  updateBlockStatus,
  syncCalendar,
  triggerIngestStream,
  generatePlan,
  updateKnowledgeTopic,
  updateGoal,
  type Goal,
  type GoalKnowledge,
  type Plan,
  type MicroBlock,
  type Topic,
} from "@/lib/api";
import { computeBlockProgress, computeTopicProgress, getDefaultSelectedDate, getLocalDateKey, getSortedDates, groupBlocksByDate, parseDateKey } from "@/lib/schedule";
import { 
  Calendar, CheckCircle2, 
  Clock, FileText, Pencil, Plus, Video, AlertTriangle, XCircle, Trash2, Save
} from "lucide-react";

export default function UnifiedGoalDashboard() {
  const params = useParams();
  const goalId = params.id as string;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [knowledge, setKnowledge] = useState<GoalKnowledge | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [showAddTopicForm, setShowAddTopicForm] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockActionId, setBlockActionId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicHours, setNewTopicHours] = useState("1");
  const [editTitle, setEditTitle] = useState("");
  const [editHours, setEditHours] = useState("");
  const [ingestStep, setIngestStep] = useState(0);

  const isHabitGoal = goal?.goal_type === "habit";

  const retrieverSteps = [
    { icon: "📄", label: "Loading goal…" },
    { icon: "📄", label: "Parsing materials & URLs…" },
    { icon: "✂️", label: "Chunking text for analysis…" },
    { icon: "🧠", label: "Extracting topics via LLM…" },
    { icon: "⏱️", label: "Estimating hours per topic…" },
    { icon: "🔍", label: "Supplementing with web resources…" },
    { icon: "📦", label: "Building knowledge graph…" },
    { icon: "💾", label: "Persisting to database…" },
    { icon: "📋", label: "Triggering planner agent…" },
  ];

  useEffect(() => {
    void loadData();
  }, [goalId]);

  async function runAction(actionId: string, action: () => Promise<void>) {
    setActionLoading(actionId);
    try {
      await action();
    } finally {
      setActionLoading("");
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const g = await getGoal(goalId);
      setGoal(g);

      const [nextKnowledge, nextPlan] = await Promise.all([
        g.knowledge_id ? getKnowledge(goalId).catch(() => null) : Promise.resolve(null),
        g.active_plan_id ? getPlanForGoal(goalId).catch(() => null) : Promise.resolve(null),
      ]);

      setKnowledge(nextKnowledge);
      setPlan(nextPlan);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function resetReviewFeedback() {
    setReviewMessage(null);
    setReviewError(null);
  }

  function beginEditTopic(topic: Topic) {
    resetReviewFeedback();
    setEditingTopicId(topic.topic_id);
    setEditTitle(topic.title);
    setEditHours(String(topic.est_hours));
  }

  function cancelEditTopic() {
    setEditingTopicId(null);
    setEditTitle("");
    setEditHours("");
  }

  async function handleAddTopic() {
    if (!knowledge) return;

    resetReviewFeedback();
    setActionLoading("topic-add");
    try {
      const updated = await addKnowledgeTopic(goalId, {
        title: newTopicTitle.trim(),
        est_hours: Number(newTopicHours),
      });
      setKnowledge(updated);
      setShowAddTopicForm(false);
      setNewTopicTitle("");
      setNewTopicHours("1");
      setReviewDirty(true);
      setReviewMessage("Topic added. Regenerate the plan to use the new topic mix.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not add topic");
    } finally {
      setActionLoading("");
    }
  }

  async function handleUpdateTopic(topicId: string) {
    if (!knowledge) return;

    resetReviewFeedback();
    setActionLoading(`topic-edit-${topicId}`);
    try {
      const updated = await updateKnowledgeTopic(goalId, topicId, {
        title: editTitle.trim(),
        est_hours: Number(editHours),
      });
      setKnowledge(updated);
      cancelEditTopic();
      setReviewDirty(true);
      setReviewMessage("Topic updated. Regenerate the plan to reflect the new estimate.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not update topic");
    } finally {
      setActionLoading("");
    }
  }

  async function handleDeleteTopic(topicId: string) {
    if (!knowledge) return;
    const confirmed = window.confirm("Delete this topic from the retriever output?");
    if (!confirmed) return;

    resetReviewFeedback();
    setActionLoading(`topic-delete-${topicId}`);
    try {
      const updated = await deleteKnowledgeTopic(goalId, topicId);
      setKnowledge(updated);
      if (editingTopicId === topicId) {
        cancelEditTopic();
      }
      setReviewDirty(true);
      setReviewMessage("Topic removed. Regenerate the plan if you want the schedule to shrink too.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not delete topic");
    } finally {
      setActionLoading("");
    }
  }

  // Calculate generic derived states
  const daysLeft = goal ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  
  // Group plan blocks by date
  const blocksByDate = groupBlocksByDate(plan?.micro_blocks || []);
  const availableDates = getSortedDates(blocksByDate);

  // Check for drift (any missed blocks)
  const hasDrift = plan?.micro_blocks.some(b => b.status === "missed");

  // Effort-weighted progress: a 2-hour block counts more than a 30-min block.
  // Partial blocks earn half credit so the bar never jumps backwards on replan.
  // Use plan.total_estimated_hours (full goal scope) as the denominator, NOT
  // the sum of this window's blocks — otherwise 7/7 window blocks = 100% even
  // when 143 hours of a 150-hour goal still remain.
  const totalEstimatedMinutes = (plan?.total_estimated_hours ?? 0) * 60;
  const blockProgress = computeBlockProgress(plan?.micro_blocks ?? [], totalEstimatedMinutes || undefined);
  const { doneMinutes, partialMinutes, totalMinutes, progressPct: progressPercent } = blockProgress;

  // Topic-level completion: a topic is "done" only when ALL its blocks are done.
  const topicIds = knowledge?.topics.map((t) => t.topic_id) ?? [];
  const topicProgress = computeTopicProgress(plan?.micro_blocks ?? [], topicIds);
  const { completedTopicIds, partialTopicIds } = topicProgress;

  // Retain block counts for the stats card
  const doneBlocks = plan?.micro_blocks.filter((b) => b.status === "done").length ?? 0;
  const partialBlocks = plan?.micro_blocks.filter((b) => b.status === "partial").length ?? 0;
  const totalBlocks = plan?.micro_blocks.length ?? 0;

  async function handleReplan() {
    await runAction("replan", async () => {
      await replanAllPlans(7);
      await loadData();
    });
  }

  async function handleStatusChange(blockId: string, status: string) {
    if (!plan) return;

    setBlockError(null);
    setBlockActionId(blockId);
    const previousPlan = plan;
    try {
      setPlan({
        ...plan,
        micro_blocks: plan.micro_blocks.map((block) =>
          block.block_id === blockId ? { ...block, status } : block
        ),
      });
      await updateBlockStatus(blockId, status);
      const updated = await getPlanForGoal(goalId);
      setPlan(updated);
    } catch (e) {
      console.error(e);
      setPlan(previousPlan);
      setBlockError(e instanceof Error ? e.message : "Could not update block status");
    } finally {
      setBlockActionId(null);
    }
  }

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatDateHeader(dateStr: string) {
    const d = parseDateKey(dateStr);
    return {
      dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dayOfMonth: d.getDate()
    };
  }

  function formatScheduleSummary() {
    if (!goal?.preferred_schedule) {
      return "Daily at 07:00 for 30 min";
    }

    const schedule = goal.preferred_schedule;
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = schedule.days.length === 7
      ? "Every day"
      : schedule.days.map((d) => dayNames[d] || d).join(", ");

    const start = `${String(schedule.start_hour).padStart(2, "0")}:00`;
    const duration = schedule.duration_min || ((schedule.end_hour - schedule.start_hour) * 60) || 30;

    return `${days} at ${start} for ${duration} min`;
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
  if (!goal) return <div className="p-8 text-center text-red-400">Goal not found</div>;

  return (
    <div className="min-h-screen pb-20">
      {/* Top Banner for Drift */}
      {reviewDirty && !isHabitGoal && (
        <div className="bg-sky-500/10 border-b border-sky-500/20 px-6 py-3 flex justify-between items-center text-sm gap-4">
          <div className="flex items-center text-sky-300 font-medium">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Topics changed after retrieval. Your current plan may be stale.
          </div>
          <button
            onClick={() => void runAction("plan", async () => {
              await generatePlan(goalId);
              await loadData();
              setReviewDirty(false);
            })}
            disabled={!!actionLoading}
            className="px-4 py-1.5 bg-sky-500 text-white rounded-md font-bold text-xs hover:bg-sky-400 transition"
          >
            {actionLoading === "plan" ? "UPDATING..." : "REGENERATE PLAN"}
          </button>
        </div>
      )}

      {hasDrift && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex justify-between items-center text-sm">
          <div className="flex items-center text-amber-300 font-medium">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Schedule drift detected. Replan recommended to stay on track.
          </div>
          <button 
            onClick={handleReplan}
            disabled={!!actionLoading}
            className="px-4 py-1.5 bg-amber-500/20 text-amber-300 rounded-md font-bold text-xs hover:bg-amber-500/30 transition"
          >
            {actionLoading === "replan" ? "REPLANNING..." : "REPLAN NOW"}
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl italic font-serif text-cyan-50 tracking-tight leading-tight mb-2">
            {goal.title}
          </h1>
          <div className="flex items-center text-slate-400 text-sm font-medium tracking-wider">
            <Clock className="w-4 h-4 mr-1.5" />
            {daysLeft} DAYS LEFT
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-slate-300">{goal.status}</span>
            {plan ? <span>{progressPercent}% complete</span> : null}
            {partialTopicIds.size > 0 ? <span>{partialTopicIds.size} topic{partialTopicIds.size !== 1 ? "s" : ""} in progress</span> : null}
          </div>
        </div>
        
        {/* Actions - typically in a navbar, but placed here for MVP */}
        <div className="flex items-start gap-3">
          <Link href={`/goals/${goalId}/edit`} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] rounded-lg transition">
            Edit Goal
          </Link>
          {goal.status !== "completed" ? (
            <button
              onClick={() => void runAction("complete", async () => {
                await updateGoal(goalId, { status: "completed" });
                await loadData();
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition"
            >
              {actionLoading === "complete" ? "Saving..." : "Mark Complete"}
            </button>
          ) : null}
          {isHabitGoal ? (
            !plan ? (
              <button 
                onClick={() => void runAction("plan", async () => {
                  await generatePlan(goalId);
                  await loadData();
                })}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20 disabled:opacity-50"
              >
                {actionLoading === "plan" ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                    Generating…
                  </>
                ) : "Generate Routine"}
              </button>
            ) : (
              <button 
                onClick={() => void runAction("sync", async () => {
                  await syncCalendar(plan.plan_id);
                })}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20 disabled:opacity-50"
              >
                {actionLoading === "sync" ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                    Syncing…
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Sync to Calendar
                  </>
                )}
              </button>
            )
          ) : !knowledge ? (
            <div>
              <button 
                onClick={() => {
                  setActionLoading("ingest");
                  setIngestStep(0);
                  triggerIngestStream(goalId, (step) => {
                    setIngestStep(step);
                  })
                    .then(() => loadData())
                    .finally(() => setActionLoading(""));
                }}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20 disabled:opacity-50"
              >
                {actionLoading === "ingest" ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                    Running Retriever…
                  </>
                ) : "Parse Materials"}
              </button>

              {/* Retriever progress ticker */}
              {actionLoading === "ingest" && (
                <div className="mt-4 glass-card p-4 animate-fadeIn">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Retriever Pipeline</p>
                  </div>
                  <div className="space-y-2">
                    {retrieverSteps.map((step, i) => {
                      const isActive = i === ingestStep;
                      const isDone = i < ingestStep;
                      const isPending = i > ingestStep;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all duration-500 ${
                            isActive
                              ? "bg-cyan-500/10 border border-cyan-500/20"
                              : isDone
                              ? "opacity-60"
                              : "opacity-30"
                          }`}
                        >
                          <span className="text-sm flex-shrink-0">
                            {isDone ? "✅" : step.icon}
                          </span>
                          <span className={isActive ? "text-cyan-100 font-medium" : isDone ? "text-slate-400 line-through" : "text-slate-600"}>
                            {step.label}
                          </span>
                          {isActive && (
                            <svg className="animate-spin ml-auto h-3.5 w-3.5 text-cyan-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 ease-out"
                      style={{ width: `${((ingestStep + 1) / retrieverSteps.length) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-600 text-right">
                    Step {ingestStep + 1} of {retrieverSteps.length}
                  </p>
                </div>
              )}
            </div>
          ) : !plan ? (
            <button 
              onClick={() => void runAction("plan", async () => {
                await generatePlan(goalId);
                await loadData();
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20 disabled:opacity-50"
            >
              {actionLoading === "plan" ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                  Generating…
                </>
              ) : "Generate Plan"}
            </button>
          ) : (
            <button 
              onClick={() => void runAction("sync", async () => {
                await syncCalendar(plan.plan_id);
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20 disabled:opacity-50"
            >
              {actionLoading === "sync" ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                  Syncing…
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Sync to Calendar
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-10 mt-6">
        
        {/* Left Sidebar: Retriever & Sources */}
        <div className="md:col-span-3 space-y-10">
          {isHabitGoal ? (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-4">Routine</h3>
              <div className="glass-card p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Schedule</p>
                  <p className="text-sm text-cyan-100">{formatScheduleSummary()}</p>
                </div>
                {goal.target_weekly_effort ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Weekly Effort</p>
                    <p className="text-sm text-cyan-100">{goal.target_weekly_effort} hrs / week</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tracking</p>
                  <p className="text-sm text-cyan-100">This habit skips material parsing and goes straight to routine scheduling.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {plan ? (
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Progress</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {Math.round(doneMinutes / 60 * 10) / 10}h done
                    {partialMinutes > 0 ? ` · ${Math.round(partialMinutes / 60 * 10) / 10}h partial` : ""}
                    {" · "}{Math.round(totalMinutes / 60 * 10) / 10}h total
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div>
                      <p className="text-lg font-semibold text-cyan-50">{completedTopicIds.size}</p>
                      <p>Topics done</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-amber-400">{partialTopicIds.size}</p>
                      <p>In progress</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-cyan-50">{topicIds.length}</p>
                      <p>Topics total</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Topics List */}
              {knowledge && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-xs font-semibold text-slate-500 tracking-widest uppercase">Retriever</h3>
                    <button
                      onClick={() => {
                        resetReviewFeedback();
                        setShowAddTopicForm((current) => !current);
                        cancelEditTopic();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:bg-white/[0.06]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Refine
                    </button>
                  </div>

                  {reviewMessage ? (
                    <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                      {reviewMessage}
                    </div>
                  ) : null}
                  {reviewError ? (
                    <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {reviewError}
                    </div>
                  ) : null}
                  {blockError ? (
                    <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {blockError}
                    </div>
                  ) : null}

                  {showAddTopicForm ? (
                    <div className="mb-4 glass-card p-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Add Topic</p>
                        <input
                          value={newTopicTitle}
                          onChange={(e) => setNewTopicTitle(e.target.value)}
                          placeholder="e.g. Model evaluation"
                          className="dark-input"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Hours</p>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={newTopicHours}
                          onChange={(e) => setNewTopicHours(e.target.value)}
                          className="dark-input"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddTopic}
                          disabled={!!actionLoading || !newTopicTitle.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Topic
                        </button>
                        <button
                          onClick={() => setShowAddTopicForm(false)}
                          className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.04]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ul className="space-y-4">
                    {knowledge.topics.map(t => (
                      <li key={t.topic_id} className="border-b border-white/[0.06] border-dotted pb-3">
                        {editingTopicId === t.topic_id ? (
                          <div className="glass-card p-3 space-y-3">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="dark-input"
                            />
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={editHours}
                              onChange={(e) => setEditHours(e.target.value)}
                              className="dark-input"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateTopic(t.topic_id)}
                                disabled={!!actionLoading || !editTitle.trim()}
                                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                onClick={cancelEditTopic}
                                className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.04]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-cyan-100 truncate pr-1" title={t.title}>{t.title}</span>
                                {completedTopicIds.has(t.topic_id) ? (
                                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                    done
                                  </span>
                                ) : partialTopicIds.has(t.topic_id) ? (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                    in progress
                                  </span>
                                ) : t.source === "user" ? (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                    edited
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs text-slate-500 font-mono">{t.est_hours}h</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => beginEditTopic(t)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.04] hover:text-cyan-300"
                                title="Edit topic"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTopic(t.topic_id)}
                                disabled={!!actionLoading}
                                className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                                title="Delete topic"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 glass-card p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Estimate</p>
                    <p className="text-lg font-semibold text-cyan-50">{knowledge.estimated_total_hours} hours</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Sources */}
          {!isHabitGoal && (goal.uploaded_file_ids.length > 0 || goal.material_urls.length > 0) ? (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-4">Sources</h3>
              <div className="space-y-3">
                {goal.uploaded_file_ids.map((file, i) => (
                  <div key={i} className="flex items-center p-3 glass-card">
                    <div className="w-8 h-8 rounded bg-red-500/10 text-red-400 flex items-center justify-center mr-3 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-cyan-100 truncate">{file.split('/').pop()}</p>
                      <p className="text-[10px] text-slate-500">Uploaded PDF</p>
                    </div>
                  </div>
                ))}
                {goal.material_urls.map((url, i) => {
                  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
                  return (
                    <div key={i} className="flex items-center p-3 glass-card">
                      <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 shrink-0 ${isYoutube ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.04] text-slate-400'}`}>
                        {isYoutube ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-cyan-100 truncate">{new URL(url).hostname}</p>
                        <p className="text-[10px] text-slate-500 truncate">{url}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Main Area: Weekly Calendar */}
        <div className="md:col-span-9">
          
          {plan && plan.micro_blocks.length > 0 ? (() => {
            // Compute the earliest and latest hours across ALL blocks
            const allBlocks = plan.micro_blocks;
            let minHour = 24;
            let maxHour = 0;
            for (const b of allBlocks) {
              const d = new Date(b.start_dt);
              const startH = d.getHours();
              const endH = startH + Math.ceil(b.duration_min / 60);
              if (startH < minHour) minHour = startH;
              if (endH > maxHour) maxHour = endH;
            }
            // Pad by 1 hour on each side for breathing room
            const gridStartHour = Math.max(0, minHour - 1);
            const gridEndHour = Math.min(24, maxHour + 1);
            const hourSlots = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);

            // Topic color palette
            const TOPIC_COLORS = [
              { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-200", accent: "bg-blue-400" },
              { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-200", accent: "bg-emerald-400" },
              { bg: "bg-violet-500/15", border: "border-violet-500/30", text: "text-violet-200", accent: "bg-violet-400" },
              { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-200", accent: "bg-amber-400" },
              { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-200", accent: "bg-rose-400" },
              { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-200", accent: "bg-cyan-400" },
              { bg: "bg-pink-500/15", border: "border-pink-500/30", text: "text-pink-200", accent: "bg-pink-400" },
              { bg: "bg-indigo-500/15", border: "border-indigo-500/30", text: "text-indigo-200", accent: "bg-indigo-400" },
            ];
            const topicColorMap: Record<string, typeof TOPIC_COLORS[0]> = {};
            let colorIdx = 0;
            for (const b of allBlocks) {
              if (!topicColorMap[b.topic_id]) {
                topicColorMap[b.topic_id] = TOPIC_COLORS[colorIdx % TOPIC_COLORS.length];
                colorIdx++;
              }
            }

            const ROW_HEIGHT = 60; // pixels per hour

            return (
              <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Weekly Schedule</h3>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3">
                    {knowledge?.topics.filter(t => topicColorMap[t.topic_id]).map(t => {
                      const c = topicColorMap[t.topic_id];
                      return (
                        <div key={t.topic_id} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <span className={`w-2.5 h-2.5 rounded-full ${c.accent}`} />
                          {t.title}
                        </div>
                      );
                    })}
                    {/* Habit goals with no knowledge */}
                    {!knowledge && isHabitGoal && (
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        {goal.title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                    {/* Day Headers */}
                    <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: "56px repeat(" + availableDates.length + ", 1fr)" }}>
                      <div className="border-r border-white/[0.04]" />
                      {availableDates.map(dateStr => {
                        const { dayOfWeek, dayOfMonth } = formatDateHeader(dateStr);
                        const isToday = dateStr === getLocalDateKey(new Date());
                        return (
                          <div key={dateStr} className={`text-center py-3 border-r border-white/[0.04] last:border-r-0 ${isToday ? 'bg-cyan-500/[0.06]' : ''}`}>
                            <div className="text-[10px] font-bold text-slate-500 tracking-widest">{dayOfWeek}</div>
                            <div className={`text-lg font-bold ${isToday ? 'text-cyan-400' : 'text-cyan-100'}`}>{dayOfMonth}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Time Grid */}
                    <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(" + availableDates.length + ", 1fr)" }}>
                      {/* Hour labels + horizontal lines */}
                      <div className="relative" style={{ height: hourSlots.length * ROW_HEIGHT }}>
                        {hourSlots.map((hour) => (
                          <div
                            key={hour}
                            className="absolute w-full border-b border-white/[0.04] flex items-start justify-end pr-2 pt-0.5"
                            style={{ top: (hour - gridStartHour) * ROW_HEIGHT, height: ROW_HEIGHT }}
                          >
                            <span className="text-[10px] font-mono text-slate-600">{String(hour).padStart(2, "0")}:00</span>
                          </div>
                        ))}
                      </div>

                      {/* Day columns with blocks */}
                      {availableDates.map(dateStr => {
                        const dayBlocks = blocksByDate[dateStr] || [];
                        const isToday = dateStr === getLocalDateKey(new Date());
                        return (
                          <div
                            key={dateStr}
                            className={`relative border-r border-white/[0.04] last:border-r-0 ${isToday ? 'bg-cyan-500/[0.03]' : ''}`}
                            style={{ height: hourSlots.length * ROW_HEIGHT }}
                          >
                            {/* Hour gridlines */}
                            {hourSlots.map((hour) => (
                              <div
                                key={hour}
                                className="absolute w-full border-b border-white/[0.04]"
                                style={{ top: (hour - gridStartHour) * ROW_HEIGHT, height: ROW_HEIGHT }}
                              />
                            ))}

                            {/* Blocks */}
                            {dayBlocks.map(block => {
                              const d = new Date(block.start_dt);
                              const startMinutes = d.getHours() * 60 + d.getMinutes();
                              const topPx = ((startMinutes / 60) - gridStartHour) * ROW_HEIGHT;
                              const heightPx = Math.max((block.duration_min / 60) * ROW_HEIGHT, 28);
                              const colors = topicColorMap[block.topic_id] || TOPIC_COLORS[0];
                              const topic = knowledge?.topics.find(t => t.topic_id === block.topic_id);
                              const isDone = block.status === "done";
                              const isPartial = block.status === "partial";
                              const isMissed = block.status === "missed";

                              return (
                                <div
                                  key={block.block_id}
                                  className={`absolute left-0.5 right-0.5 rounded-lg border px-1.5 py-1 overflow-hidden cursor-default group transition-shadow hover:shadow-md ${colors.bg} ${colors.border} ${isDone ? 'opacity-60' : isMissed ? 'opacity-40' : ''}`}
                                  style={{ top: topPx, height: heightPx }}
                                  title={`${topic?.title || goal.title}\n${formatTime(block.start_dt)} – ${block.duration_min} min\nStatus: ${block.status}`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-[10px] font-bold leading-tight truncate ${colors.text} ${isDone ? 'line-through' : ''}`}>
                                        {topic?.title || (isHabitGoal ? goal.title : `Topic ${block.topic_id.substring(0,6)}`)}
                                      </p>
                                      {heightPx >= 40 && (
                                        <p className={`text-[9px] mt-0.5 ${colors.text} opacity-70`}>
                                          {formatTime(block.start_dt)} · {block.duration_min}m
                                        </p>
                                      )}
                                    </div>
                                    {/* Status indicator */}
                                    <div className="shrink-0 mt-0.5">
                                      {isDone && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                      {isPartial && <Clock className="w-3 h-3 text-amber-400" />}
                                      {isMissed && <AlertTriangle className="w-3 h-3 text-red-400" />}
                                    </div>
                                  </div>

                                  {/* Action buttons on hover for scheduled blocks */}
                                  {block.status === "scheduled" && heightPx >= 48 && (
                                    <div className="hidden group-hover:flex gap-1 mt-0.5">
                                      <button
                                        onClick={() => handleStatusChange(block.block_id, "done")}
                                        disabled={blockActionId === block.block_id}
                                        className="p-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleStatusChange(block.block_id, "partial")}
                                        disabled={blockActionId === block.block_id}
                                        className="p-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition disabled:opacity-50"
                                      >
                                        <Clock className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleStatusChange(block.block_id, "missed")}
                                        disabled={blockActionId === block.block_id}
                                        className="p-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50"
                                      >
                                        <XCircle className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Current time indicator */}
                            {isToday && (() => {
                              const now = new Date();
                              const nowMinutes = now.getHours() * 60 + now.getMinutes();
                              const nowHour = nowMinutes / 60;
                              if (nowHour >= gridStartHour && nowHour <= gridEndHour) {
                                const topNow = (nowHour - gridStartHour) * ROW_HEIGHT;
                                return (
                                  <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: topNow }}>
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                                      <div className="flex-1 h-px bg-red-500" />
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Block status list for small blocks / mobile fallback */}
                {blockError && (
                  <div className="mx-6 mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {blockError}
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="h-64 border-2 border-dashed border-white/[0.08] rounded-2xl flex items-center justify-center text-slate-500">
              {isHabitGoal ? "Generate a routine to see your schedule" : "Generate a plan to see your timeline"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
