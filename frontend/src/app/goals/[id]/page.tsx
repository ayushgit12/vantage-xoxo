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
  triggerIngest,
  generatePlan,
  updateKnowledgeTopic,
  updateGoal,
  type Goal,
  type GoalKnowledge,
  type Plan,
  type MicroBlock,
  type Topic,
} from "@/lib/api";
import { computeBlockProgress, computeTopicProgress, getDefaultSelectedDate, getSortedDates, groupBlocksByDate, parseDateKey } from "@/lib/schedule";
import { 
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, 
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
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isHabitGoal = goal?.goal_type === "habit";

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
  
  // Set default selected date if none chosen
  useEffect(() => {
    setSelectedDate((current) => {
      if (current && availableDates.includes(current)) {
        return current;
      }
      return getDefaultSelectedDate(availableDates);
    });
  }, [availableDates, selectedDate]);

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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (!goal) return <div className="p-8 text-center text-red-500">Goal not found</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Top Banner for Drift */}
      {reviewDirty && !isHabitGoal && (
        <div className="bg-sky-50 border-b border-sky-200 px-6 py-3 flex justify-between items-center text-sm gap-4">
          <div className="flex items-center text-sky-800 font-medium">
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
            className="px-4 py-1.5 bg-sky-600 text-white rounded-md font-bold text-xs hover:bg-sky-700 transition"
          >
            {actionLoading === "plan" ? "UPDATING..." : "REGENERATE PLAN"}
          </button>
        </div>
      )}

      {hasDrift && (
        <div className="bg-[#fff8e6] border-b border-[#fce4a6] px-6 py-3 flex justify-between items-center text-sm">
          <div className="flex items-center text-[#9c5f14] font-medium">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Schedule drift detected. Replan recommended to stay on track.
          </div>
          <button 
            onClick={handleReplan}
            disabled={!!actionLoading}
            className="px-4 py-1.5 bg-[#fce4a6] text-[#9c5f14] rounded-md font-bold text-xs hover:bg-[#fae096] transition"
          >
            {actionLoading === "replan" ? "REPLANNING..." : "REPLAN NOW"}
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl italic font-serif text-slate-800 tracking-tight leading-tight mb-2">
            {goal.title}
          </h1>
          <div className="flex items-center text-slate-500 text-sm font-medium tracking-wider">
            <Clock className="w-4 h-4 mr-1.5" />
            {daysLeft} DAYS LEFT
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">{goal.status}</span>
            {plan ? <span>{progressPercent}% complete</span> : null}
            {partialTopicIds.size > 0 ? <span>{partialTopicIds.size} topic{partialTopicIds.size !== 1 ? "s" : ""} in progress</span> : null}
          </div>
        </div>
        
        {/* Actions - typically in a navbar, but placed here for MVP */}
        <div className="flex gap-3">
          <Link href={`/goals/${goalId}/edit`} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">
            Edit Goal
          </Link>
          {goal.status !== "completed" ? (
            <button
              onClick={() => void runAction("complete", async () => {
                await updateGoal(goalId, { status: "completed" });
                await loadData();
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition"
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
                className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
              >
                Generate Routine
              </button>
            ) : (
              <button 
                onClick={() => void runAction("sync", async () => {
                  await syncCalendar(plan.plan_id);
                })}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Sync to Calendar
              </button>
            )
          ) : !knowledge ? (
            <button 
              onClick={() => void runAction("ingest", async () => {
                await triggerIngest(goalId);
                await loadData();
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              Parse Materials
            </button>
          ) : !plan ? (
            <button 
              onClick={() => void runAction("plan", async () => {
                await generatePlan(goalId);
                await loadData();
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              Generate Plan
            </button>
          ) : (
            <button 
              onClick={() => void runAction("sync", async () => {
                await syncCalendar(plan.plan_id);
              })}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Sync to Calendar
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
              <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-4">Routine</h3>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Schedule</p>
                  <p className="text-sm text-slate-700">{formatScheduleSummary()}</p>
                </div>
                {goal.target_weekly_effort ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Weekly Effort</p>
                    <p className="text-sm text-slate-700">{goal.target_weekly_effort} hrs / week</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tracking</p>
                  <p className="text-sm text-slate-700">This habit skips material parsing and goes straight to routine scheduling.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {plan ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Progress</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {Math.round(doneMinutes / 60 * 10) / 10}h done
                    {partialMinutes > 0 ? ` · ${Math.round(partialMinutes / 60 * 10) / 10}h partial` : ""}
                    {" · "}{Math.round(totalMinutes / 60 * 10) / 10}h total
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{completedTopicIds.size}</p>
                      <p>Topics done</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-amber-600">{partialTopicIds.size}</p>
                      <p>In progress</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{topicIds.length}</p>
                      <p>Topics total</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Topics List */}
              {knowledge && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase">Retriever</h3>
                    <button
                      onClick={() => {
                        resetReviewFeedback();
                        setShowAddTopicForm((current) => !current);
                        cancelEditTopic();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Refine
                    </button>
                  </div>

                  {reviewMessage ? (
                    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {reviewMessage}
                    </div>
                  ) : null}
                  {reviewError ? (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {reviewError}
                    </div>
                  ) : null}
                  {blockError ? (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {blockError}
                    </div>
                  ) : null}

                  {showAddTopicForm ? (
                    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Add Topic</p>
                        <input
                          value={newTopicTitle}
                          onChange={(e) => setNewTopicTitle(e.target.value)}
                          placeholder="e.g. Model evaluation"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
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
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddTopic}
                          disabled={!!actionLoading || !newTopicTitle.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Topic
                        </button>
                        <button
                          onClick={() => setShowAddTopicForm(false)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ul className="space-y-4">
                    {knowledge.topics.map(t => (
                      <li key={t.topic_id} className="border-b border-slate-200 border-dotted pb-3">
                        {editingTopicId === t.topic_id ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                            />
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={editHours}
                              onChange={(e) => setEditHours(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateTopic(t.topic_id)}
                                disabled={!!actionLoading || !editTitle.trim()}
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                onClick={cancelEditTopic}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-700 truncate pr-1" title={t.title}>{t.title}</span>
                                {completedTopicIds.has(t.topic_id) ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                    done
                                  </span>
                                ) : partialTopicIds.has(t.topic_id) ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                    in progress
                                  </span>
                                ) : t.source === "user" ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                    edited
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs text-slate-400 font-mono">{t.est_hours}h</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => beginEditTopic(t)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit topic"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTopic(t.topic_id)}
                                disabled={!!actionLoading}
                                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Estimate</p>
                    <p className="text-lg font-semibold text-slate-800">{knowledge.estimated_total_hours} hours</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Sources */}
          {!isHabitGoal && (goal.uploaded_file_ids.length > 0 || goal.material_urls.length > 0) ? (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-4">Sources</h3>
              <div className="space-y-3">
                {goal.uploaded_file_ids.map((file, i) => (
                  <div key={i} className="flex items-center p-3 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <div className="w-8 h-8 rounded bg-red-50 text-red-500 flex items-center justify-center mr-3 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-slate-700 truncate">{file.split('/').pop()}</p>
                      <p className="text-[10px] text-slate-400">Uploaded PDF</p>
                    </div>
                  </div>
                ))}
                {goal.material_urls.map((url, i) => {
                  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
                  return (
                    <div key={i} className="flex items-center p-3 border border-slate-200 rounded-xl bg-white shadow-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 shrink-0 ${isYoutube ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'}`}>
                        {isYoutube ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-700 truncate">{new URL(url).hostname}</p>
                        <p className="text-[10px] text-slate-400 truncate">{url}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Main Area: Timeline */}
        <div className="md:col-span-9">
          
          {plan ? (
            <div className="bg-white border text-slate-800 rounded-2xl shadow-sm overflow-hidden">
              {/* Date Carousel */}
              <div className="flex items-center justify-between border-b px-2 py-2 mb-6">
                <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex flex-1 justify-center gap-2 overflow-x-auto no-scrollbar">
                  {availableDates.map(dateStr => {
                    const { dayOfWeek, dayOfMonth } = formatDateHeader(dateStr);
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button 
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`flex flex-col items-center justify-center w-14 h-16 rounded-xl transition-all ${
                          isSelected ? 'bg-brand-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`text-[10px] font-bold ${isSelected ? 'text-brand-100' : ''}`}>{dayOfWeek}</span>
                        <span className="text-lg font-bold">{dayOfMonth}</span>
                      </button>
                    );
                  })}
                </div>
                <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Timeline Container */}
              <div className="px-6 py-4 space-y-6 max-h-[500px] overflow-y-auto">
                {(selectedDate && blocksByDate[selectedDate] ? blocksByDate[selectedDate] : []).map(block => {
                  const topic = knowledge?.topics.find(t => t.topic_id === block.topic_id);
                  const isDone = block.status === "done";
                  const isPartial = block.status === "partial";
                  const isMissed = block.status === "missed";
                  // Assuming the next 'scheduled' block is active
                  const isActive = block.status === "scheduled" && new Date(block.start_dt).getTime() < Date.now() + 3600000;
                  
                  let cardStyle = "block-upcoming";
                  if (isDone) cardStyle = "block-done";
                  else if (isPartial) cardStyle = "block-partial";
                  else if (isMissed) cardStyle = "block-missed";
                  else if (isActive) cardStyle = "block-active";

                  return (
                    <div key={block.block_id} className="relative flex items-start gap-4">
                      {/* Left Time label */}
                      <div className="w-12 pt-4 text-xs font-mono font-medium text-slate-400 text-right shrink-0">
                        {formatTime(block.start_dt)}
                      </div>
                      
                      {/* Block Card */}
                      <div className={`flex-1 rounded-xl p-4 flex justify-between items-center transition-all ${cardStyle}`}>
                        <div>
                          <h4 className={`font-semibold text-sm mb-1 ${isDone ? 'line-through opacity-70' : ''}`}>
                            {topic?.title || `Topic ${block.topic_id.substring(0,8)}`}
                          </h4>
                          <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                            <span className="px-1.5 py-0.5 rounded bg-black/5 uppercase font-bold tracking-wider">
                              {block.duration_min >= 60 ? `${block.duration_min/60} HRS` : `${block.duration_min} MIN`}
                            </span>
                            {topic?.title && <span className="opacity-70">— {goal?.category || "Study"}</span>}
                          </div>
                        </div>

                        {/* Interactive Status Icons */}
                        <div className="flex gap-2 shrink-0">
                          {block.status === "scheduled" && (
                            <>
                              <button
                                onClick={() => handleStatusChange(block.block_id, "done")}
                                disabled={blockActionId === block.block_id}
                                className="p-2 text-green-600 hover:bg-green-100 rounded-full transition disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(block.block_id, "partial")}
                                disabled={blockActionId === block.block_id}
                                className="p-2 text-amber-600 hover:bg-amber-100 rounded-full transition disabled:opacity-50"
                              >
                                <Clock className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(block.block_id, "missed")}
                                disabled={blockActionId === block.block_id}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-full transition disabled:opacity-50"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          )}
                          {isDone && <CheckCircle2 className="w-6 h-6 text-green-600" />}
                          {isPartial && (
                            <div className="flex flex-col items-center">
                              <Clock className="w-5 h-5 text-amber-600 mb-0.5" />
                              <span className="text-[9px] font-bold text-amber-600 tracking-wider">PARTIAL</span>
                            </div>
                          )}
                          {isMissed && (
                            <div className="flex flex-col items-center">
                              <AlertTriangle className="w-5 h-5 text-red-500 mb-0.5" />
                              <span className="text-[9px] font-bold text-red-500 tracking-wider">MISSED</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!selectedDate || !blocksByDate[selectedDate]?.length) && (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No blocks scheduled for this date.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
              {isHabitGoal ? "Generate a routine to see your schedule" : "Generate a plan to see your timeline"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
