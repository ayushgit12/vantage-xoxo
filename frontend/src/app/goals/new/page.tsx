"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGoalFromScenario } from "@/lib/api";

const PRIORITIES = ["high", "medium", "low"];

export default function NewGoalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      overrides.deadline = new Date(manualDeadline).toISOString();
    }
    const weeklyHours = form.get("weekly_hours");
    if (weeklyHours) {
      overrides.target_weekly_effort = Number(weeklyHours);
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
