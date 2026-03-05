"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGoal } from "@/lib/api";

const CATEGORIES = ["course", "project", "skill", "hobby", "fitness", "internship", "other"];
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

    try {
      const goal = await createGoal({
        title: form.get("title") as string,
        category: form.get("category") as string,
        deadline: new Date(form.get("deadline") as string).toISOString(),
        priority: form.get("priority") as string,
        target_weekly_effort: form.get("weekly_hours")
          ? Number(form.get("weekly_hours"))
          : undefined,
        prefer_user_materials_only: form.get("user_materials_only") === "on",
        material_urls: (form.get("urls") as string)
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
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
      <h1 className="text-2xl font-bold mb-6">Create New Goal</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            name="title"
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g., Learn Machine Learning"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select name="category" className="w-full border rounded-lg px-3 py-2">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
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
            <label className="block text-sm font-medium mb-1">Deadline</label>
            <input name="deadline" type="date" required className="w-full border rounded-lg px-3 py-2" />
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
          {loading ? "Creating..." : "Create Goal"}
        </button>
      </form>
    </div>
  );
}
