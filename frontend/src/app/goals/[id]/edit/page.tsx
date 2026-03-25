"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { getGoal, updateGoal, type Goal, type GoalPriority, type GoalStatus, type TimeWindow } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSectionSkeleton } from "@/components/ui/app-skeletons";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <FormSectionSkeleton />
        <FormSectionSkeleton />
      </div>
    );
  }

  if (!goal) {
    return <div className="p-8 text-center text-red-500">Goal not found</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Goal Editor</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">Edit Goal</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Update metadata and scheduling preferences for this goal.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/goals/${goalId}`}>Cancel</Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Goal Details</CardTitle>
            <CardDescription>Core properties used by the planner.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Title</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Description</label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Priority</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as GoalPriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Status</label>
              <Select value={status} onValueChange={(value) => setStatus(value as GoalStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Deadline</label>
              <Input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Weekly Effort (hours)</label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={weeklyEffort}
                onChange={(event) => setWeeklyEffort(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Restricted Time Slots</CardTitle>
            <CardDescription>Prevent scheduling during these windows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={addRestrictedSlot}>
                Add Restriction
              </Button>
            </div>

            {restrictedSlots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500">
                No restricted windows configured.
              </p>
            ) : (
              restrictedSlots.map((slot, idx) => (
                <div key={idx} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">From</label>
                      <Select
                        value={String(slot.start_hour)}
                        onValueChange={(value) => updateRestrictedSlot(idx, "start_hour", Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">To</label>
                      <Select
                        value={String(slot.end_hour)}
                        onValueChange={(value) => updateRestrictedSlot(idx, "end_hour", Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRestrictedSlot(idx)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {DAY_LABELS.map((label, day) => (
                      <Button
                        key={day}
                        type="button"
                        variant={slot.days.includes(day) ? "secondary" : "outline"}
                        size="xs"
                        onClick={() => toggleDay(idx, day)}
                        className="rounded-full"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <Button type="submit" disabled={saving} className="h-10 bg-zinc-900 px-6 text-white hover:bg-zinc-800">
          {saving ? "Saving..." : "Save Goal"}
        </Button>
      </form>
    </div>
  );
}