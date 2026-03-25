"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createGoalFromScenario, getScenarioSuggestions, type TimeWindow } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIORITIES = ["high", "medium", "low"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export default function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [scenarioSuggestions, setScenarioSuggestions] = useState<string[]>([]);
  const [restrictedSlots, setRestrictedSlots] = useState<TimeWindow[]>([
    { start_hour: 14, end_hour: 15, days: [0, 1, 2, 3, 4, 5, 6] },
  ]);
  const [scenarioText, setScenarioText] = useState("");
  const [deadlineText, setDeadlineText] = useState("");
  const [lastSuggestedFor, setLastSuggestedFor] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadlineDate, setDeadlineDate] = useState<Date | undefined>(undefined);
  const [weeklyHoursText, setWeeklyHoursText] = useState("");
  const [weeklyHoursRiskLoading, setWeeklyHoursRiskLoading] = useState(false);
  const [showWeeklyHoursWarning, setShowWeeklyHoursWarning] = useState(false);
  const suggestionRequestRef = useRef(0);
  const weeklyHoursTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasVisibleSuggestions = suggestionsLoading || scenarioSuggestions.length > 0 || !!suggestionError;

  useEffect(() => {
    const scenarioFromQuery = searchParams.get("scenario")?.trim() || "";
    const deadlineFromQuery = searchParams.get("deadline")?.trim() || "";
    if (scenarioFromQuery) {
      setScenarioText(scenarioFromQuery);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(deadlineFromQuery)) {
      setDeadlineText(deadlineFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    const query = scenarioText.trim();

    if (query.length < 8) {
      setSuggestionsLoading(false);
      setSuggestionError("");
      setScenarioSuggestions([]);
      return;
    }

    if (query === lastSuggestedFor) {
      return;
    }

    const currentRequestId = ++suggestionRequestRef.current;
    setSuggestionsLoading(true);
    setSuggestionError("");

    const timer = setTimeout(async () => {
      try {
        const result = await getScenarioSuggestions(query);
        if (suggestionRequestRef.current !== currentRequestId) return;
        setScenarioSuggestions(result.suggestions.slice(0, 2));
        setLastSuggestedFor(query);
      } catch (err: any) {
        if (suggestionRequestRef.current !== currentRequestId) return;
        setSuggestionError(err?.message || "Could not generate scenario suggestions right now.");
        setScenarioSuggestions([]);
      } finally {
        if (suggestionRequestRef.current === currentRequestId) {
          setSuggestionsLoading(false);
        }
      }
    }, 700);

    return () => {
      clearTimeout(timer);
    };
  }, [scenarioText, lastSuggestedFor]);

  useEffect(() => {
    const value = Number(weeklyHoursText);
    const exceedsRecommended = Number.isFinite(value) && value > 40;

    if (weeklyHoursTimerRef.current) {
      clearTimeout(weeklyHoursTimerRef.current);
      weeklyHoursTimerRef.current = null;
    }

    if (!weeklyHoursText || !exceedsRecommended) {
      setWeeklyHoursRiskLoading(false);
      setShowWeeklyHoursWarning(false);
      return;
    }

    setShowWeeklyHoursWarning(false);
    setWeeklyHoursRiskLoading(true);

    weeklyHoursTimerRef.current = setTimeout(() => {
      setWeeklyHoursRiskLoading(false);
      setShowWeeklyHoursWarning(true);
    }, 1300);

    return () => {
      if (weeklyHoursTimerRef.current) {
        clearTimeout(weeklyHoursTimerRef.current);
      }
    };
  }, [weeklyHoursText]);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);

    const scenario = scenarioText.trim();
    const manualDeadline = deadlineDate ? format(deadlineDate, "yyyy-MM-dd") : deadlineText.trim();
    if (manualDeadline) {
      const selectedDate = new Date(`${manualDeadline}T00:00:00`);
      if (selectedDate < getTodayStart()) {
        setError("Deadline cannot be earlier than today.");
        setLoading(false);
        return;
      }
    }
    const materialUrls = (form.get("urls") as string)
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    // Build overrides — only include deadline if user actually picked one
    const overrides: Record<string, unknown> = {
      priority: form.get("priority") as string,
      prefer_user_materials_only: form.get("user_materials_only") === "on",
      material_urls: materialUrls,
    };
    if (manualDeadline) {
      overrides.deadline = toDeadlineIso(manualDeadline);
    }
    const weeklyHours = form.get("weekly_hours");
    if (weeklyHours) {
      overrides.target_weekly_effort = Number(weeklyHours);
    }
    if (restrictedSlots.length > 0) {
      overrides.restricted_slots = restrictedSlots;
    }

    try {
      const goal = await createGoalFromScenario({
        scenario_text: scenario,
        overrides,
      });
      router.push(`/goals/${goal.goal_id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-500">Goal Intake</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-950">Create a New Goal</h1>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-900">Scenario</h2>
              <label className="mb-1 block text-sm font-medium text-zinc-800">Describe your goal</label>
              <textarea
                name="scenario"
                required
                className={`dark-input w-full resize-none transition-all ${
                  hasVisibleSuggestions ? "min-h-[140px]" : "min-h-[200px]"
                }`}
                placeholder="e.g., I want to do 20 pushups daily before breakfast and stay consistent for 3 months."
                value={scenarioText}
                onChange={(e) => setScenarioText(e.target.value)}
              />

              {suggestionsLoading ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <svg className="h-3.5 w-3.5 animate-spin text-zinc-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                  Generating AI suggestions...
                </div>
              ) : null}

              {scenarioSuggestions.length > 0 ? (
                <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  <p className="mb-1 px-1 text-[11px] font-medium text-zinc-500">AI Suggestions</p>
                  <div className="space-y-1">
                    {scenarioSuggestions.map((suggestion, idx) => (
                      <div key={`${suggestion}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg bg-white px-2.5 py-2">
                        <p className="text-xs leading-relaxed text-zinc-700">{suggestion}</p>
                        <Button
                          type="button"
                          onClick={() => setScenarioText(suggestion)}
                          variant="outline"
                          size="xs"
                          className="shrink-0 border-zinc-300 text-[11px] text-zinc-700"
                        >
                          Apply
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {suggestionError ? <p className="mt-2 text-xs text-red-600">{suggestionError}</p> : null}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-900">Materials</h2>
              <label className="mb-1 block text-sm font-medium text-zinc-800">Material URLs (one per line)</label>
              <textarea
                name="urls"
                className="dark-input min-h-[160px] w-full resize-none font-mono text-sm"
                placeholder={"https://youtube.com/playlist?list=...\nhttps://github.com/user/repo\nhttps://example.com/syllabus.html"}
              />

              <div className="mt-3 flex items-center gap-2">
                <input type="checkbox" name="user_materials_only" id="umo" className="accent-zinc-900" />
                <label htmlFor="umo" className="text-sm text-zinc-700">
                  Use only my uploaded materials
                </label>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-900">Planning Preferences</h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-800">Priority</label>
                  <input type="hidden" name="priority" value={priority} />
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-10 border-zinc-300 text-zinc-900">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent align="start" position="popper" className="w-[var(--radix-select-trigger-width)]">
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-800">Weekly Hours</label>
                  <input
                    name="weekly_hours"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="80"
                    className="dark-input"
                    placeholder="e.g., 10"
                    value={weeklyHoursText}
                    onChange={(e) => setWeeklyHoursText(e.target.value)}
                  />
                  {weeklyHoursRiskLoading ? (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="mb-1 h-2 w-28 animate-pulse rounded bg-amber-200" />
                      <p className="text-xs text-amber-700">Checking your past consistency...</p>
                    </div>
                  ) : null}
                  {showWeeklyHoursWarning ? (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>As per your history, you are usually not able to commit this many hours each week.</span>
                    </div>
                  ) : null}
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-zinc-800">Deadline (optional for habits)</label>
                  <input
                    type="hidden"
                    name="deadline"
                    value={deadlineDate ? format(deadlineDate, "yyyy-MM-dd") : ""}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full justify-start border-zinc-300 bg-white text-left text-zinc-900"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {deadlineDate ? format(deadlineDate, "PPP") : "Pick a deadline"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={16}
                    >
                      <Calendar
                        mode="single"
                        selected={deadlineDate}
                        onSelect={(date) => {
                          setDeadlineDate(date);
                          setDeadlineText(date ? format(date, "yyyy-MM-dd") : "");
                        }}
                        disabled={{ before: getTodayStart() }}
                        captionLayout="label"
                        className="w-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-800">Restricted Time Slots</label>
                <Button
                  type="button"
                  onClick={addRestrictedSlot}
                  variant="outline"
                  size="xs"
                  className="border-zinc-300 text-zinc-700"
                >
                  + Add
                </Button>
              </div>

              {restrictedSlots.map((slot, idx) => (
                <div key={idx} className="mb-2 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">From</label>
                      <Select
                        value={String(slot.start_hour)}
                        onValueChange={(value) => updateRestrictedSlot(idx, "start_hour", Number(value))}
                      >
                        <SelectTrigger className="h-9 border-zinc-300 bg-white text-xs text-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start" position="popper" className="w-[var(--radix-select-trigger-width)]">
                          {HOUR_OPTIONS.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {formatHour(h)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">To</label>
                      <Select
                        value={String(slot.end_hour)}
                        onValueChange={(value) => updateRestrictedSlot(idx, "end_hour", Number(value))}
                      >
                        <SelectTrigger className="h-9 border-zinc-300 bg-white text-xs text-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start" position="popper" className="w-[var(--radix-select-trigger-width)]">
                          {HOUR_OPTIONS.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {formatHour(h)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeRestrictedSlot(idx)}
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(idx, day)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          slot.days.includes(day)
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 bg-white text-zinc-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={loading}
                className="h-10 bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                {loading ? "Creating..." : "Create Goal From Scenario"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
