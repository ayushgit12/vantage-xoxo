"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { getGoal, updateGoal, type Goal, type GoalPriority, type GoalStatus } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";

const PRIORITIES: GoalPriority[] = ["high", "medium", "low"];
const STATUSES: GoalStatus[] = ["active", "paused", "completed", "archived"];

export default function EditGoalPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("medium");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [deadline, setDeadline] = useState("");
  const [weeklyEffort, setWeeklyEffort] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const nextGoal = await getGoal(goalId);
        setGoal(nextGoal);
        setTitle(nextGoal.title);
        setDescription(nextGoal.description || "");
        setPriority(nextGoal.priority);
        setStatus(nextGoal.status);
        setDeadline(nextGoal.deadline.slice(0, 10));
        setWeeklyEffort(nextGoal.target_weekly_effort ? String(nextGoal.target_weekly_effort) : "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load goal");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [goalId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updateGoal(goalId, {
        title,
        description,
        priority,
        status,
        deadline: toDeadlineIso(deadline),
        target_weekly_effort: weeklyEffort ? Number(weeklyEffort) : null,
      });
      router.push(`/goals/${goalId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update goal");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading goal editor...</div>;
  }

  if (!goal) {
    return <div className="p-8 text-center text-red-500">Goal not found</div>;
  }

  return (
    <div className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Goal Editor</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Edit Goal</h1>
          <p className="mt-2 text-sm text-slate-500">
            Update the goal metadata that shapes priority, completion state, and planning behavior.
          </p>
        </div>
        <Link href={`/goals/${goalId}`} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <select value={priority} onChange={(event) => setPriority(event.target.value as GoalPriority)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              {STATUSES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Deadline</label>
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Weekly Effort</label>
            <input type="number" min="0.5" step="0.5" value={weeklyEffort} onChange={(event) => setWeeklyEffort(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Optional" />
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button disabled={saving} className="w-full rounded-xl bg-brand-600 py-2.5 text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save Goal"}
        </button>
      </form>
    </div>
  );
}