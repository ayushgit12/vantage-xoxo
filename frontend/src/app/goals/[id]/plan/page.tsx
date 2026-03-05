"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getPlanForGoal,
  updateBlockStatus,
  syncCalendar,
  type Plan,
  type MicroBlock,
} from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "block-scheduled",
  done: "block-done",
  partial: "block-partial",
  missed: "block-missed",
  cancelled: "bg-gray-100 border-gray-300",
};

export default function PlanPage() {
  const params = useParams();
  const goalId = params.id as string;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlanForGoal(goalId)
      .then(setPlan)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [goalId]);

  async function handleStatusChange(blockId: string, status: string) {
    try {
      await updateBlockStatus(blockId, status);
      // Reload plan after status update
      const updated = await getPlanForGoal(goalId);
      setPlan(updated);
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <p>Loading plan...</p>;
  if (!plan) return <p>No plan found. Generate one first.</p>;

  // Group blocks by date
  const blocksByDate = plan.micro_blocks.reduce(
    (acc, block) => {
      const date = new Date(block.start_dt).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(block);
      return acc;
    },
    {} as Record<string, MicroBlock[]>
  );

  const totalMin = plan.micro_blocks.reduce((s, b) => s + b.duration_min, 0);
  const doneMin = plan.micro_blocks
    .filter((b) => b.status === "done")
    .reduce((s, b) => s + b.duration_min, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Study Plan</h1>
          <p className="text-gray-500 text-sm mt-1">
            {plan.micro_blocks.length} blocks · {Math.round(totalMin / 60)}h total ·{" "}
            {Math.round(doneMin / 60)}h done
          </p>
        </div>
        <div className="w-48 bg-gray-200 rounded-full h-3">
          <div
            className="bg-green-500 h-3 rounded-full transition-all"
            style={{ width: `${totalMin > 0 ? (doneMin / totalMin) * 100 : 0}%` }}
          />
        </div>
      </div>

      {plan.explanation && (
        <div className="p-4 bg-blue-50 rounded-lg text-sm text-gray-700">
          {plan.explanation}
        </div>
      )}

      {Object.entries(blocksByDate).map(([date, blocks]) => (
        <div key={date}>
          <h2 className="font-semibold text-sm text-gray-500 mb-2">{date}</h2>
          <div className="space-y-2">
            {blocks.map((block) => (
              <div
                key={block.block_id}
                className={`p-3 border rounded-lg flex items-center justify-between ${
                  STATUS_COLORS[block.status] || ""
                }`}
              >
                <div>
                  <span className="font-medium text-sm">
                    {new Date(block.start_dt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-gray-500 text-sm ml-2">
                    {block.duration_min} min
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    Topic: {block.topic_id.slice(0, 8)}…
                  </span>
                </div>
                <div className="flex gap-1">
                  {block.status === "scheduled" && (
                    <>
                      <button
                        onClick={() => handleStatusChange(block.block_id, "done")}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => handleStatusChange(block.block_id, "partial")}
                        className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
                      >
                        Partial
                      </button>
                      <button
                        onClick={() => handleStatusChange(block.block_id, "missed")}
                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Missed
                      </button>
                    </>
                  )}
                  {block.status !== "scheduled" && (
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 capitalize">
                      {block.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
