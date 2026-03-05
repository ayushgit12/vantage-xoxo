"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listGoals, type Goal } from "@/lib/api";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listGoals()
      .then(setGoals)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading goals...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Goals</h1>
        <Link
          href="/goals/new"
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          + New Goal
        </Link>
      </div>

      {goals.length === 0 ? (
        <p className="text-gray-500">No goals yet. Create one to get started!</p>
      ) : (
        <div className="grid gap-4">
          {goals.map((goal) => (
            <Link
              key={goal.goal_id}
              href={`/goals/${goal.goal_id}`}
              className="block p-4 border rounded-lg bg-white hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{goal.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {goal.category} · {goal.priority} priority · due{" "}
                    {new Date(goal.deadline).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {goal.knowledge_id && (
                    <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                      Knowledge Ready
                    </span>
                  )}
                  {goal.active_plan_id && (
                    <span className="inline-block ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      Plan Active
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
