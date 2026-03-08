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
    return <div className="mx-auto max-w-3xl p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Phase 1</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Planner Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Teach the planner when you are awake, when you work best, and which recurring commitments should always stay blocked.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
            <p className="text-sm text-slate-500">This powers personalized scheduling and block density.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Display Name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="How should Vantage address you?"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Optional"
                type="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Timezone</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Daily Capacity (hours)</label>
              <input
                type="number"
                value={dailyCapacity}
                min={1}
                max={16}
                step={0.5}
                onChange={(event) => setDailyCapacity(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Max Topics Per Day</label>
              <input
                type="number"
                value={maxTopicsPerDay}
                min={1}
                max={6}
                step={1}
                onChange={(event) => setMaxTopicsPerDay(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sleep Window</h2>
            <p className="text-sm text-slate-500">These hours stay blocked across all seven days.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Sleep Start</label>
              <input
                type="time"
                value={sleepStart}
                onChange={(event) => setSleepStart(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sleep End</label>
              <input
                type="time"
                value={sleepEnd}
                onChange={(event) => setSleepEnd(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Preferred Study Window</h2>
            <p className="text-sm text-slate-500">The planner will favor this range before filling other open slots.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Window Start</label>
              <input
                type="time"
                value={preferredStart}
                onChange={(event) => setPreferredStart(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Window End</label>
              <input
                type="time"
                value={preferredEnd}
                onChange={(event) => setPreferredEnd(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Preferred Days</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, index) => {
                const active = preferredDays.includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(index, preferredDays, setPreferredDays)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-brand-600 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {saved ? <p className="text-sm text-emerald-600">Settings saved.</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Weekly Commitments</h2>
            <p className="text-sm text-slate-500">
              Add recurring classes, work shifts, or team rituals so they stay blocked out of your study schedule.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <input
            value={constraintTitle}
            onChange={(event) => setConstraintTitle(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
            placeholder="e.g. Standup, class, gym"
          />
          <input
            type="time"
            value={constraintStart}
            onChange={(event) => setConstraintStart(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            type="time"
            value={constraintEnd}
            onChange={(event) => setConstraintEnd(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {DAYS.map((day, index) => {
            const active = constraintDays.includes(index);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(index, constraintDays, setConstraintDays)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddConstraint}
          disabled={constraintBusy}
          className="mt-4 rounded-xl border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-50"
        >
          {constraintBusy ? "Working..." : "Add Weekly Commitment"}
        </button>

        <div className="mt-6 space-y-3">
          {recurringConstraints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              No recurring commitments yet. Add the weekly blocks you want the planner to always respect.
            </div>
          ) : (
            recurringConstraints.map((constraint) => (
              <div
                key={constraint.constraint_id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{constraint.title}</p>
                  <p className="text-sm text-slate-500">
                    {constraint.recurring_days.map((day) => DAYS[day]).join(", ")} | {constraint.recurring_start} - {constraint.recurring_end}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteConstraint(constraint.constraint_id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
