"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Pencil,
  Plus,
  Save,
  Trash2,
  Video,
  XCircle,
} from "lucide-react";

import {
  addKnowledgeTopic,
  deleteKnowledgeTopic,
  generatePlan,
  getGoal,
  getGoalSuggestions,
  getKnowledge,
  getPlanForGoal,
  replanAllPlans,
  syncCalendar,
  triggerIngestStream,
  updateBlockStatus,
  updateGoal,
  updateKnowledgeTopic,
  type Goal,
  type GoalKnowledge,
  type Plan,
  type Topic,
} from "@/lib/api";
import {
  computeBlockProgress,
  computeTopicProgress,
  getDefaultSelectedDate,
  getLocalDateKey,
  getSortedDates,
  groupBlocksByDate,
  parseDateKey,
} from "@/lib/schedule";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatHours(hours: number): string {
  return `${Math.round(hours * 10) / 10}h`;
}

function statusTone(status: string): string {
  if (status === "active") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "paused") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "completed") return "bg-zinc-200 text-zinc-700 border-zinc-300";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = params.id as string;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [knowledge, setKnowledge] = useState<GoalKnowledge | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState("");
  const [blockActionId, setBlockActionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAddTopicForm, setShowAddTopicForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicHours, setNewTopicHours] = useState("1");

  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editHours, setEditHours] = useState("");

  const [goalSuggestions, setGoalSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  const [ingestStep, setIngestStep] = useState(0);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);

  const retrieverSteps = [
    "Loading goal",
    "Parsing materials",
    "Chunking text",
    "Extracting topics",
    "Estimating hours",
    "Supplementing sources",
    "Building knowledge",
    "Saving output",
    "Triggering planner",
  ];

  useEffect(() => {
    void loadData();
  }, [goalId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSuggestions() {
      setSuggestionsLoading(true);
      try {
        const result = await getGoalSuggestions(goalId);
        if (!cancelled) {
          setGoalSuggestions(result.suggestions.slice(0, 2));
        }
      } catch {
        if (!cancelled) {
          setGoalSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      }
    }

    void loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [goalId]);

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
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Could not load goal details.");
    } finally {
      setLoading(false);
    }
  }

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  async function runAction(id: string, action: () => Promise<void>) {
    setActionLoading(id);
    try {
      await action();
    } finally {
      setActionLoading("");
    }
  }

  const isHabitGoal = goal?.goal_type === "habit";
  const hasGoalMaterials = (goal?.uploaded_file_ids.length ?? 0) > 0 || (goal?.material_urls.length ?? 0) > 0;
  const shouldUseRetrieverFlow = !isHabitGoal || hasGoalMaterials;

  const blocksByDate = useMemo(() => groupBlocksByDate(plan?.micro_blocks || []), [plan]);
  const availableDates = useMemo(() => getSortedDates(blocksByDate), [blocksByDate]);

  useEffect(() => {
    setSelectedDate((current) => {
      if (current && availableDates.includes(current)) return current;
      return getDefaultSelectedDate(availableDates);
    });
  }, [availableDates]);

  const selectedIndex = selectedDate ? availableDates.indexOf(selectedDate) : -1;

  function goPrevDate() {
    if (selectedIndex > 0) setSelectedDate(availableDates[selectedIndex - 1]);
  }

  function goNextDate() {
    if (selectedIndex >= 0 && selectedIndex < availableDates.length - 1) {
      setSelectedDate(availableDates[selectedIndex + 1]);
    }
  }

  function formatDateChip(dateStr: string) {
    const d = parseDateKey(dateStr);
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(),
    };
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  async function handleStatusChange(blockId: string, status: string) {
    if (!plan) return;
    setBlockActionId(blockId);
    const previous = plan;

    try {
      setPlan({
        ...plan,
        micro_blocks: plan.micro_blocks.map((b) => (b.block_id === blockId ? { ...b, status } : b)),
      });
      await updateBlockStatus(blockId, status);
      const refreshed = await getPlanForGoal(goalId);
      setPlan(refreshed);
    } catch (e) {
      console.error(e);
      setPlan(previous);
      setError("Could not update block status.");
    } finally {
      setBlockActionId(null);
    }
  }

  function beginEditTopic(topic: Topic) {
    resetFeedback();
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

    resetFeedback();
    setActionLoading("topic-add");
    try {
      const updated = await addKnowledgeTopic(goalId, {
        title: newTopicTitle.trim(),
        est_hours: Number(newTopicHours),
      });
      setKnowledge(updated);
      setNewTopicTitle("");
      setNewTopicHours("1");
      setShowAddTopicForm(false);
      setMessage("Topic added. Regenerate plan to reflect the change.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add topic.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleUpdateTopic(topicId: string) {
    if (!knowledge) return;

    resetFeedback();
    setActionLoading(`topic-edit-${topicId}`);
    try {
      const updated = await updateKnowledgeTopic(goalId, topicId, {
        title: editTitle.trim(),
        est_hours: Number(editHours),
      });
      setKnowledge(updated);
      cancelEditTopic();
      setMessage("Topic updated. Regenerate plan to use the new estimate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update topic.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleDeleteTopic(topicId: string) {
    if (!knowledge) return;
    if (!window.confirm("Delete this topic?")) return;

    resetFeedback();
    setActionLoading(`topic-delete-${topicId}`);
    try {
      const updated = await deleteKnowledgeTopic(goalId, topicId);
      setKnowledge(updated);
      if (editingTopicId === topicId) cancelEditTopic();
      setMessage("Topic removed. Regenerate plan to sync schedule.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete topic.");
    } finally {
      setActionLoading("");
    }
  }

  const totalEstimatedMinutes = (plan?.total_estimated_hours ?? 0) * 60;
  const blockProgress = computeBlockProgress(plan?.micro_blocks ?? [], totalEstimatedMinutes || undefined);
  const topicProgress = computeTopicProgress(plan?.micro_blocks ?? [], knowledge?.topics.map((t) => t.topic_id) ?? []);

  const hasDrift = plan?.micro_blocks.some((b) => b.status === "missed") ?? false;
  const daysLeft = goal
    ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const sourceItems = useMemo(() => {
    if (!goal) return [] as Array<{
      key: string;
      title: string;
      subtitle: string;
      url?: string;
      transcript: string;
      isYoutube: boolean;
    }>;

    const refs = knowledge?.resource_refs ?? [];
    const refsByUrl = new Map(refs.map((r) => [r.url, r]));

    const uploaded = goal.uploaded_file_ids.map((file, i) => {
      const fileName = file.split("/").pop() || file;
      const matchedRef = refs.find(
        (ref) => ref.source_type === "pdf" && (ref.title === fileName || ref.url.includes(fileName))
      );

      return {
        key: `file-${i}`,
        title: fileName,
        subtitle: "Uploaded PDF",
        url: matchedRef?.url,
        transcript: matchedRef?.transcript || "",
        isYoutube: false,
      };
    });

    const urls = goal.material_urls.map((url, i) => {
      const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
      const matchedRef = refsByUrl.get(url);
      let host = url;

      try {
        host = new URL(url).hostname;
      } catch {
        host = url;
      }

      return {
        key: `url-${i}`,
        title: matchedRef?.title || host,
        subtitle: url,
        url,
        transcript: matchedRef?.transcript || "",
        isYoutube,
      };
    });

    return [...uploaded, ...urls];
  }, [goal, knowledge]);

  useEffect(() => {
    if (sourceItems.length === 0) {
      if (selectedSourceKey !== null) setSelectedSourceKey(null);
      return;
    }
    if (selectedSourceKey && !sourceItems.some((s) => s.key === selectedSourceKey)) {
      setSelectedSourceKey(null);
    }
  }, [sourceItems, selectedSourceKey]);

  const selectedSource = sourceItems.find((item) => item.key === selectedSourceKey) ?? null;

  if (loading) {
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

  if (!goal) {
    return <div className="p-8 text-center text-red-600">Goal not found.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 lg:flex lg:h-[calc(100vh-88px)] lg:flex-col">
      {hasDrift ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Schedule drift detected from missed blocks.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-300 bg-white"
            disabled={Boolean(actionLoading)}
            onClick={() =>
              void runAction("replan", async () => {
                await replanAllPlans(7);
                await loadData();
                setMessage("Replan completed.");
              })
            }
          >
            {actionLoading === "replan" ? "Replanning..." : "Replan Now"}
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 lg:shrink-0">
        <div>
          <h1 className="mt-1 text-3xl font-bold text-zinc-950">{goal.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`rounded-full border px-2 py-1 ${statusTone(goal.status)}`}>{goal.status}</span>
            <span className="text-zinc-600">{daysLeft} days left</span>
            {plan ? <span className="text-zinc-600">{blockProgress.progressPct}% complete</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="border-zinc-300 bg-white">
            <Link href={`/goals/${goalId}/edit`}>Edit Goal</Link>
          </Button>

          {goal.status !== "completed" ? (
            <Button
              type="button"
              variant="outline"
              className="border-zinc-300 bg-white text-emerald-700"
              disabled={Boolean(actionLoading)}
              onClick={() =>
                void runAction("complete", async () => {
                  await updateGoal(goalId, { status: "completed" });
                  await loadData();
                  setMessage("Goal marked completed.");
                })
              }
            >
              {actionLoading === "complete" ? "Saving..." : "Mark Complete"}
            </Button>
          ) : null}

          {!shouldUseRetrieverFlow ? (
            !plan ? (
              <Button
                type="button"
                className="bg-zinc-900 text-white hover:bg-zinc-800"
                disabled={Boolean(actionLoading)}
                onClick={() =>
                  void runAction("plan", async () => {
                    await generatePlan(goalId);
                    await loadData();
                    setMessage("Routine generated.");
                  })
                }
              >
                {actionLoading === "plan" ? "Generating..." : "Generate Routine"}
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-zinc-900 text-white hover:bg-zinc-800"
                disabled={Boolean(actionLoading)}
                onClick={() =>
                  void runAction("sync", async () => {
                    await syncCalendar(plan.plan_id);
                    setMessage("Synced to calendar.");
                  })
                }
              >
                {actionLoading === "sync" ? "Syncing..." : "Sync Calendar"}
              </Button>
            )
          ) : !knowledge ? (
            <Button
              type="button"
              className="bg-zinc-900 text-white hover:bg-zinc-800"
              disabled={Boolean(actionLoading)}
              onClick={() => {
                resetFeedback();
                setActionLoading("ingest");
                setIngestStep(0);

                triggerIngestStream(goalId, (step) => {
                  setIngestStep(step);
                })
                  .then(() => loadData())
                  .then(() => setMessage("Materials parsed successfully."))
                  .catch((e) => {
                    setError(e instanceof Error ? e.message : "Failed to parse materials.");
                  })
                  .finally(() => setActionLoading(""));
              }}
            >
              {actionLoading === "ingest" ? "Running Retriever..." : "Parse Materials"}
            </Button>
          ) : !plan ? (
            <Button
              type="button"
              className="bg-zinc-900 text-white hover:bg-zinc-800"
              disabled={Boolean(actionLoading)}
              onClick={() =>
                void runAction("plan", async () => {
                  await generatePlan(goalId);
                  await loadData();
                  setMessage("Plan generated.");
                })
              }
            >
              {actionLoading === "plan" ? "Generating..." : "Generate Plan"}
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-zinc-900 text-white hover:bg-zinc-800"
              disabled={Boolean(actionLoading)}
              onClick={() =>
                void runAction("sync", async () => {
                  await syncCalendar(plan.plan_id);
                  setMessage("Synced to calendar.");
                })
              }
            >
              {actionLoading === "sync" ? "Syncing..." : "Sync Calendar"}
            </Button>
          )}
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 items-start gap-6 lg:flex-1 lg:grid-cols-[320px_1fr] lg:overflow-hidden">
        <aside className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1 no-scrollbar">
          {actionLoading === "ingest" ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Retriever Pipeline</h2>
              <div className="mt-3 space-y-2">
                {retrieverSteps.map((step, i) => {
                  const isActive = i === ingestStep;
                  const isDone = i < ingestStep;
                  return (
                    <div
                      key={step}
                      className={`rounded-md border px-2 py-1.5 text-xs ${
                        isActive
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : isDone
                          ? "border-zinc-200 bg-zinc-100 text-zinc-600"
                          : "border-zinc-200 bg-white text-zinc-500"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Progress</h2>
            {plan ? (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-zinc-900"
                    style={{ width: `${blockProgress.progressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {formatHours(blockProgress.doneMinutes / 60)} done
                  {blockProgress.partialMinutes > 0
                    ? ` · ${formatHours(blockProgress.partialMinutes / 60)} partial`
                    : ""}
                  {` · ${formatHours(blockProgress.totalMinutes / 60)} total`}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-zinc-50 p-2">
                    <p className="text-base font-semibold text-zinc-900">{topicProgress.completedTopicIds.size}</p>
                    <p className="text-zinc-500">Done</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2">
                    <p className="text-base font-semibold text-zinc-900">{topicProgress.partialTopicIds.size}</p>
                    <p className="text-zinc-500">Partial</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-2">
                    <p className="text-base font-semibold text-zinc-900">{knowledge?.topics.length ?? 0}</p>
                    <p className="text-zinc-500">Topics</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Generate a plan to see progress.</p>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">You Can Also Do</h2>
            <div className="mt-3 space-y-2">
              {suggestionsLoading ? (
                <p className="text-xs text-zinc-500">Loading suggestions...</p>
              ) : goalSuggestions.length > 0 ? (
                goalSuggestions.map((suggestion, i) => (
                  <Link
                    key={`${suggestion}-${i}`}
                    href={`/goals/new?scenario=${encodeURIComponent(suggestion)}`}
                    className="block rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    {suggestion}
                  </Link>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No suggestions right now.</p>
              )}
            </div>
          </section>

          {sourceItems.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Sources</h2>
              <div className="mt-3 space-y-2">
                {sourceItems.map((source) => (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() =>
                      setSelectedSourceKey((current) => (current === source.key ? null : source.key))
                    }
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs ${
                      selectedSourceKey === source.key
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {source.isYoutube ? <Video className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    <span className="truncate">{source.title}</span>
                  </button>
                ))}
              </div>

              {selectedSource ? (
                <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2.5">
                  <p className="mb-1 text-xs font-semibold text-zinc-700">Transcript</p>
                  <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-zinc-600">
                    {selectedSource.transcript || "Transcript not available for this source yet."}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>

        <div className="flex min-h-0 flex-col gap-4 lg:h-full">
          {knowledge ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-900">Retriever Topics</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-zinc-300 bg-white"
                  onClick={() => {
                    resetFeedback();
                    setShowAddTopicForm((current) => !current);
                    cancelEditTopic();
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Refine
                </Button>
              </div>

              {showAddTopicForm ? (
                <div className="mb-3 grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_120px_auto_auto] sm:items-end">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Title</label>
                    <input
                      value={newTopicTitle}
                      onChange={(e) => setNewTopicTitle(e.target.value)}
                      placeholder="e.g. Model evaluation"
                      className="dark-input h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Hours</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={newTopicHours}
                      onChange={(e) => setNewTopicHours(e.target.value)}
                      className="dark-input h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 bg-zinc-900 text-white hover:bg-zinc-800"
                    disabled={Boolean(actionLoading) || !newTopicTitle.trim()}
                    onClick={handleAddTopic}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 border-zinc-300 bg-white"
                    onClick={() => setShowAddTopicForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 no-scrollbar md:grid-cols-2 xl:grid-cols-3">
                {knowledge.topics.map((topic) => (
                  <div key={topic.topic_id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    {editingTopicId === topic.topic_id ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto_auto] sm:items-end">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="dark-input h-9"
                        />
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={editHours}
                          onChange={(e) => setEditHours(e.target.value)}
                          className="dark-input h-9"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 bg-zinc-900 text-white hover:bg-zinc-800"
                          disabled={Boolean(actionLoading) || !editTitle.trim()}
                          onClick={() => handleUpdateTopic(topic.topic_id)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 border-zinc-300 bg-white"
                          onClick={cancelEditTopic}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{topic.title}</p>
                          <p className="text-xs text-zinc-600">{topic.est_hours}h</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-zinc-700 hover:bg-zinc-100"
                            onClick={() => beginEditTopic(topic)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-rose-600 hover:bg-rose-50"
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleDeleteTopic(topic.topic_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                Total estimate: {knowledge.estimated_total_hours} hours
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-zinc-600" />
                <h2 className="text-sm font-semibold text-zinc-900">Schedule</h2>
              </div>

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

            {plan && availableDates.length > 0 ? (
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 no-scrollbar">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {availableDates.map((dateStr) => {
                    const chip = formatDateChip(dateStr);
                    const isSelected = selectedDate === dateStr;
                    const isToday = dateStr === getLocalDateKey(new Date());
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => setSelectedDate(dateStr)}
                        className={`min-w-[72px] rounded-lg border px-2 py-2 text-center transition ${
                          isSelected
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : isToday
                            ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider">{chip.day}</p>
                        <p className="mt-0.5 text-base font-bold">{chip.date}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  {(selectedDate ? blocksByDate[selectedDate] || [] : []).map((block) => {
                    const isDone = block.status === "done";
                    const isPartial = block.status === "partial";
                    const isMissed = block.status === "missed";

                    return (
                      <div key={block.block_id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                              {formatTime(block.start_dt)} · {block.duration_min}m
                            </p>
                            <p className={`mt-1 text-sm font-semibold text-zinc-900 ${isDone ? "line-through opacity-70" : ""}`}>
                              {knowledge?.topics.find((t) => t.topic_id === block.topic_id)?.title || `Topic ${block.topic_id.slice(0, 8)}`}
                            </p>
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
                                  className="text-amber-600 hover:bg-amber-50"
                                  disabled={blockActionId === block.block_id}
                                  onClick={() => handleStatusChange(block.block_id, "partial")}
                                >
                                  <Clock3 className="h-4 w-4" />
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
                  })}

                  {selectedDate && (blocksByDate[selectedDate] || []).length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                      No blocks scheduled for this date.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                {isHabitGoal ? "Generate a routine to populate schedule." : "Generate a plan to populate schedule."}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
