"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createGoalFromScenario, getScenarioSuggestions, type TimeWindow } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";

const PRIORITIES = ["high", "medium", "low"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [scenarioSuggestions, setScenarioSuggestions] = useState<string[]>([]);
  const [restrictedSlots, setRestrictedSlots] = useState<TimeWindow[]>([]);
  const [scenarioText, setScenarioText] = useState("");
  const [lastSuggestedFor, setLastSuggestedFor] = useState("");
  const suggestionRequestRef = useRef(0);

  useEffect(() => {
    const scenarioFromQuery = searchParams.get("scenario")?.trim() || "";
    if (scenarioFromQuery) {
      setScenarioText(scenarioFromQuery);
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
    const manualDeadline = form.get("deadline") as string;
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
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6 text-cyan-50">Describe Your Goal Scenario</h1>

      <form onSubmit={handleSubmit} className="space-y-5 glass-card p-6">
        <div>
          <label className="block text-sm font-medium mb-1 text-cyan-100">Scenario</label>
          <textarea
            name="scenario"
            required
            rows={4}
            className="dark-input"
            placeholder="e.g., I want to do 20 pushups daily before breakfast and stay consistent for 3 months."
            value={scenarioText}
            onChange={(e) => setScenarioText(e.target.value)}
          />
          <p className="text-[10px] text-slate-500 mt-2">AI suggestions auto-generate when you pause typing.</p>

          {suggestionsLoading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 text-cyan-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
              Generating AI suggestions...
            </div>
          ) : null}

          {scenarioSuggestions.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {scenarioSuggestions.map((suggestion, idx) => (
                <button
                  key={`${suggestion}-${idx}`}
                  type="button"
                  onClick={() => setScenarioText(suggestion)}
                  className="w-full text-left rounded-lg border border-cyan-500/20 bg-cyan-500/8 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-500/14 transition"
                >
                  {suggestion}
                </button>
              ))}
              <p className="text-[10px] text-slate-500">(Click one to use it as your scenario)</p>
            </div>
          ) : null}

          {suggestionError ? <p className="text-red-400 text-xs mt-2">{suggestionError}</p> : null}
          <p className="text-xs text-slate-500 mt-1">
            The model auto-detects goal type and creates structured data.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1 text-cyan-100">Priority</label>
            <select name="priority" className="dark-select">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-cyan-100">Deadline (optional for habits)</label>
            <input name="deadline" type="date" className="dark-input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-cyan-100">Weekly Hours (optional)</label>
            <input name="weekly_hours" type="number" step="0.5" min="0.5" max="80" className="dark-input" placeholder="e.g., 10" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-cyan-100">Material URLs (one per line)</label>
          <textarea
            name="urls"
            rows={4}
            className="dark-input font-mono text-sm"
            placeholder={"https://youtube.com/playlist?list=...\nhttps://github.com/user/repo\nhttps://example.com/syllabus.html"}
          />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" name="user_materials_only" id="umo" className="accent-cyan-500" />
          <label htmlFor="umo" className="text-sm text-cyan-100">
            Use only my uploaded materials (no web supplementation)
          </label>
        </div>

        {/* Restricted Time Slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-cyan-100">Restricted Time Slots</label>
            <button
              type="button"
              onClick={addRestrictedSlot}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              + Add Restriction
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Times when you do NOT want this goal scheduled (e.g., lunch break, meetings).
          </p>
          {restrictedSlots.map((slot, idx) => (
            <div key={idx} className="flex flex-col gap-2 border border-white/[0.08] rounded-lg p-3 mb-2 bg-white/[0.02]">
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

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-2 rounded-lg hover:brightness-110 disabled:opacity-50 transition"
        >
          {loading ? "Creating..." : "Create Goal From Scenario"}
        </button>
      </form>
    </div>
  );
}
