"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { getGoal, updateGoal, type Goal, type GoalPriority, type GoalStatus, type TimeWindow } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";

const PRIORITIES: GoalPriority[] = ["high", "medium", "low"];
const STATUSES: GoalStatus[] = ["active", "paused", "completed", "archived"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [restrictedSlots, setRestrictedSlots] = useState<TimeWindow[]>([]);

  function addRestrictedSlot() {
    setRestrictedSlots((prev) => [
      ...prev,
      { start_hour: 14, end_hour: 15, days: [0, 1, 2, 3, 4, 5, 6] },
    ]);
  }

  function removeRestrictedSlot(index: number) {
    setRestrictedSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRestrictedSlot(index: number, field: string, value: number | number[]) {
    setRestrictedSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    );
  }

  function toggleDay(index: number, day: number) {
    setRestrictedSlots((prev) =>
      prev.map((slot, i) => {
        if (i !== index) return slot;
        const days = slot.days.includes(day)
          ? slot.days.filter((d) => d !== day)
          : [...slot.days, day].sort();
        return { ...slot, days: days.length ? days : slot.days };
      })
    );
  }

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
        setRestrictedSlots(nextGoal.restricted_slots || []);
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
        restricted_slots: restrictedSlots,
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
    return <div className="p-8 text-center text-red-400">Goal not found</div>;
  }

  return (
    <div className="mx-auto max-w-2xl glass-card p-8 mt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Goal Editor</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-cyan-50">Edit Goal</h1>
          <p className="mt-2 text-sm text-slate-400">
            Update the goal metadata that shapes priority, completion state, and planning behavior.
          </p>
        </div>
        <Link href={`/goals/${goalId}`} className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.04]">
          Cancel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-cyan-100">Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="dark-input" required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-cyan-100">Description</label>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="dark-input" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-cyan-100">Priority</label>
            <select value={priority} onChange={(event) => setPriority(event.target.value as GoalPriority)} className="dark-select">
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-cyan-100">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)} className="dark-select">
              {STATUSES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-cyan-100">Deadline</label>
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="dark-input" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-cyan-100">Weekly Effort</label>
            <input type="number" min="0.5" step="0.5" value={weeklyEffort} onChange={(event) => setWeeklyEffort(event.target.value)} className="dark-input" placeholder="Optional" />
          </div>
        </div>

        {/* Restricted Time Slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="mb-0 block text-sm font-medium text-cyan-100">Restricted Time Slots</label>
            <button
              type="button"
              onClick={addRestrictedSlot}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              + Add Restriction
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Times when you do NOT want this goal scheduled.
          </p>
          {restrictedSlots.map((slot, idx) => (
            <div key={idx} className="flex flex-col gap-2 rounded-xl border border-white/[0.08] p-3 mb-2 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-slate-500">From</label>
                  <select
                    value={slot.start_hour}
                    onChange={(e) => updateRestrictedSlot(idx, "start_hour", Number(e.target.value))}
                    className="dark-select text-sm !w-auto"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-slate-500">To</label>
                  <select
                    value={slot.end_hour}
                    onChange={(e) => updateRestrictedSlot(idx, "end_hour", Number(e.target.value))}
                    className="dark-select text-sm !w-auto"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeRestrictedSlot(idx)}
                  className="ml-auto text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(idx, day)}
                    className={`px-2 py-0.5 text-xs rounded-full border ${
                      slot.days.includes(day)
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        : "bg-white/[0.02] text-slate-500 border-white/[0.1]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <button disabled={saving} className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-white hover:brightness-110 disabled:opacity-50 transition">
          {saving ? "Saving..." : "Save Goal"}
        </button>
      </form>
    </div>
  );
}