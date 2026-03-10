"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGoalFromScenario, type TimeWindow } from "@/lib/api";
import { toDeadlineIso } from "@/lib/schedule";

const PRIORITIES = ["high", "medium", "low"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function NewGoalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);

    const scenario = (form.get("scenario") as string).trim();
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Describe Your Goal Scenario</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Scenario</label>
          <textarea
            name="scenario"
            required
            rows={4}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g., I want to do 20 pushups daily before breakfast and stay consistent for 3 months."
          />
          <p className="text-xs text-gray-500 mt-1">
            The model auto-detects goal type and creates structured data.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select name="priority" className="w-full border rounded-lg px-3 py-2">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Deadline (optional for habits)</label>
            <input name="deadline" type="date" className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Weekly Hours (optional)</label>
            <input name="weekly_hours" type="number" step="0.5" min="0.5" max="80" className="w-full border rounded-lg px-3 py-2" placeholder="e.g., 10" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Material URLs (one per line)</label>
          <textarea
            name="urls"
            rows={4}
            className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
            placeholder={"https://youtube.com/playlist?list=...\nhttps://github.com/user/repo\nhttps://example.com/syllabus.html"}
          />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" name="user_materials_only" id="umo" />
          <label htmlFor="umo" className="text-sm">
            Use only my uploaded materials (no web supplementation)
          </label>
        </div>

        {/* Restricted Time Slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">Restricted Time Slots</label>
            <button
              type="button"
              onClick={addRestrictedSlot}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              + Add Restriction
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Times when you do NOT want this goal scheduled (e.g., lunch break, meetings).
          </p>
          {restrictedSlots.map((slot, idx) => (
            <div key={idx} className="flex flex-col gap-2 border rounded-lg p-3 mb-2 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500">From</label>
                  <select
                    value={slot.start_hour}
                    onChange={(e) => updateRestrictedSlot(idx, "start_hour", Number(e.target.value))}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500">To</label>
                  <select
                    value={slot.end_hour}
                    onChange={(e) => updateRestrictedSlot(idx, "end_hour", Number(e.target.value))}
                    className="border rounded px-2 py-1 text-sm"
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
                  className="ml-auto text-xs text-red-500 hover:text-red-700"
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
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-slate-500 border-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Goal From Scenario"}
        </button>
      </form>
    </div>
  );
}
