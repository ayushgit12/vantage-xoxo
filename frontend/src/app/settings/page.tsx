"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createConstraint,
  deleteConstraint,
  getUserProfile,
  listConstraints,
  updateUserProfile,
  type TimeConstraint,
  type TimeWindow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCardsSkeleton, FormSectionSkeleton } from "@/components/ui/app-skeletons";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Tokyo",
];

function hourToTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function timeToHour(value: string) {
  return Number(value.split(":")[0] || 0);
}

function defaultSleepWindow(): TimeWindow {
  return { start_hour: 23, end_hour: 7, days: [0, 1, 2, 3, 4, 5, 6] };
}

function defaultPreferredWindow(): TimeWindow {
  return { start_hour: 9, end_hour: 17, days: [0, 1, 2, 3, 4] };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<TimeConstraint[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [dailyCapacity, setDailyCapacity] = useState("8");
  const [maxTopicsPerDay, setMaxTopicsPerDay] = useState("2");
  const [sleepStart, setSleepStart] = useState("23:00");
  const [sleepEnd, setSleepEnd] = useState("07:00");
  const [preferredStart, setPreferredStart] = useState("09:00");
  const [preferredEnd, setPreferredEnd] = useState("17:00");
  const [preferredDays, setPreferredDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [constraintTitle, setConstraintTitle] = useState("");
  const [constraintStart, setConstraintStart] = useState("09:00");
  const [constraintEnd, setConstraintEnd] = useState("10:00");
  const [constraintDays, setConstraintDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [constraintBusy, setConstraintBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [profile, nextConstraints] = await Promise.all([getUserProfile(), listConstraints()]);
        const sleep = profile.sleep_window || defaultSleepWindow();
        const preferred = profile.preferred_time_windows[0] || defaultPreferredWindow();

        setDisplayName(profile.display_name || "");
        setEmail(profile.email || "");
        setTimezone(profile.timezone || "UTC");
        setDailyCapacity(String(profile.daily_capacity_hours ?? 8));
        setMaxTopicsPerDay(String(profile.max_topics_per_day ?? 2));
        setSleepStart(hourToTime(sleep.start_hour));
        setSleepEnd(hourToTime(sleep.end_hour));
        setPreferredStart(hourToTime(preferred.start_hour));
        setPreferredEnd(hourToTime(preferred.end_hour));
        setPreferredDays(preferred.days.length ? preferred.days : [0, 1, 2, 3, 4]);
        setConstraints(nextConstraints);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load settings");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const recurringConstraints = useMemo(
    () => constraints.filter((constraint) => constraint.type === "recurring"),
    [constraints],
  );

  function toggleDay(day: number, current: number[], setter: (days: number[]) => void) {
    setter(current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort());
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await updateUserProfile({
        display_name: displayName,
        email,
        timezone,
        daily_capacity_hours: Number(dailyCapacity),
        max_topics_per_day: Number(maxTopicsPerDay),
        sleep_window: {
          start_hour: timeToHour(sleepStart),
          end_hour: timeToHour(sleepEnd),
          days: [0, 1, 2, 3, 4, 5, 6],
        },
        preferred_time_windows: [
          {
            start_hour: timeToHour(preferredStart),
            end_hour: timeToHour(preferredEnd),
            days: preferredDays,
          },
        ],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddConstraint() {
    if (!constraintTitle.trim() || constraintDays.length === 0) {
      setError("Add a title and at least one day for a weekly commitment");
      return;
    }

    setConstraintBusy(true);
    setError(null);
    try {
      const created = await createConstraint({
        type: "recurring",
        title: constraintTitle.trim(),
        recurring_start: constraintStart,
        recurring_end: constraintEnd,
        recurring_days: constraintDays,
      });
      setConstraints((current) => [...current, created]);
      setConstraintTitle("");
      setConstraintStart("09:00");
      setConstraintEnd("10:00");
      setConstraintDays([0, 1, 2, 3, 4]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add commitment");
    } finally {
      setConstraintBusy(false);
    }
  }

  async function handleDeleteConstraint(constraintId: string) {
    setConstraintBusy(true);
    setError(null);
    try {
      await deleteConstraint(constraintId);
      setConstraints((current) => current.filter((constraint) => constraint.constraint_id !== constraintId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete commitment");
    } finally {
      setConstraintBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <DashboardCardsSkeleton />
        <FormSectionSkeleton />
        <FormSectionSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Phase 1</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">Planner Settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Teach the planner when you are awake, when you work best, and which recurring commitments should always stay blocked.
        </p>
      </div>

      <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Profile</CardTitle>
            <CardDescription>This powers personalized scheduling and block density.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Display Name</label>
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should Vantage address you?"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Email</label>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Optional"
                type="email"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Timezone</label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Daily Capacity (hours)</label>
              <Input
                type="number"
                value={dailyCapacity}
                min={1}
                max={16}
                step={0.5}
                onChange={(event) => setDailyCapacity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Max Topics Per Day</label>
              <Input
                type="number"
                value={maxTopicsPerDay}
                min={1}
                max={6}
                step={1}
                onChange={(event) => setMaxTopicsPerDay(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Sleep Window</CardTitle>
            <CardDescription>These hours stay blocked across all seven days.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Sleep Start</label>
              <Input
                type="time"
                value={sleepStart}
                onChange={(event) => setSleepStart(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-800">Sleep End</label>
              <Input
                type="time"
                value={sleepEnd}
                onChange={(event) => setSleepEnd(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Preferred Study Window</CardTitle>
            <CardDescription>The planner favors this range before filling other open slots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-800">Window Start</label>
                <Input
                  type="time"
                  value={preferredStart}
                  onChange={(event) => setPreferredStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-800">Window End</label>
                <Input
                  type="time"
                  value={preferredEnd}
                  onChange={(event) => setPreferredEnd(event.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-800">Preferred Days</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day, index) => {
                  const active = preferredDays.includes(index);
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="xs"
                      variant={active ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => toggleDay(index, preferredDays, setPreferredDays)}
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle>Weekly Commitments</CardTitle>
            <CardDescription>
              Add recurring classes, work shifts, or team rituals so they stay blocked out of your study schedule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-2 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
              <Input
                value={constraintTitle}
                onChange={(event) => setConstraintTitle(event.target.value)}
                placeholder="e.g. Standup, class, gym"
              />
              <Input
                type="time"
                value={constraintStart}
                onChange={(event) => setConstraintStart(event.target.value)}
              />
              <Input
                type="time"
                value={constraintEnd}
                onChange={(event) => setConstraintEnd(event.target.value)}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {DAYS.map((day, index) => {
                const active = constraintDays.includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index, constraintDays, setConstraintDays)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              onClick={handleAddConstraint}
              disabled={constraintBusy}
              variant="outline"
              className="mt-3"
            >
              {constraintBusy ? "Working..." : "Add Weekly Commitment"}
            </Button>

            <div className="mt-4 max-h-48 space-y-2.5 overflow-y-auto pr-1">
              {recurringConstraints.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500">
                  No recurring commitments yet. Add the weekly blocks you want the planner to always respect.
                </div>
              ) : (
                recurringConstraints.map((constraint) => (
                  <div
                    key={constraint.constraint_id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{constraint.title}</p>
                      <p className="text-sm text-zinc-600">
                        {constraint.recurring_days.map((day) => DAYS[day]).join(", ")} | {constraint.recurring_start} - {constraint.recurring_end}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleDeleteConstraint(constraint.constraint_id)}
                      variant="destructive"
                      size="xs"
                    >
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="space-y-0.5">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {saved ? <p className="text-sm text-zinc-700">Settings saved.</p> : null}
            {!error && !saved ? <p className="text-sm text-zinc-500">Save profile and scheduling preferences.</p> : null}
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="h-9 bg-zinc-900 px-6 text-white hover:bg-zinc-800"
          >
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
