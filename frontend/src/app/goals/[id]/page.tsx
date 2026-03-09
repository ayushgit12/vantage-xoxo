"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getGoal,
  getKnowledge,
  triggerIngest,
  generatePlan,
  syncCalendar,
  type Goal,
  type GoalKnowledge,
} from "@/lib/api";

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = params.id as string;
  const router = useRouter();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [knowledge, setKnowledge] = useState<GoalKnowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    loadData();
  }, [goalId]);

  async function loadData() {
    try {
      const g = await getGoal(goalId);
      setGoal(g);
      if (g.knowledge_id) {
        const k = await getKnowledge(goalId);
        setKnowledge(k);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleIngest() {
    setActionLoading("ingest");
    try {
      await triggerIngest(goalId);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading("");
    }
  }

  async function handleGeneratePlan() {
    setActionLoading("plan");
    try {
      await generatePlan(goalId);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading("");
    }
  }

  async function handleSync() {
    if (!goal?.active_plan_id) return;
    setActionLoading("sync");
    try {
      await syncCalendar(goal.active_plan_id);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading("");
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!goal) return <p>Goal not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{goal.title}</h1>
          <p className="text-gray-500 mt-1">
            {goal.category} · {goal.priority} · due{" "}
            {new Date(goal.deadline).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleIngest}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === "ingest" ? "Processing..." : "Run Retriever"}
          </button>
          <button
            onClick={handleGeneratePlan}
            disabled={!!actionLoading || !knowledge}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === "plan" ? "Generating..." : "Generate Plan"}
          </button>
          <button
            onClick={handleSync}
            disabled={!!actionLoading || !goal.active_plan_id}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {actionLoading === "sync" ? "Syncing..." : "Sync Calendar"}
          </button>
        </div>
      </div>

      {/* Knowledge Panel */}
      {knowledge && (
        <div className="border rounded-lg p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">
            GoalKnowledge
            <span className="ml-2 text-sm font-normal text-gray-500">
              Confidence: {(knowledge.confidence_score * 100).toFixed(0)}%
            </span>
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">
                Topics ({knowledge.topics.length}) —{" "}
                {knowledge.estimated_total_hours}h total
              </h3>
              <ul className="space-y-2">
                {knowledge.topics.map((t) => (
                  <li key={t.topic_id} className="text-sm border-l-2 border-brand-300 pl-3">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-gray-500 ml-2">{t.est_hours}h</span>
                    {t.description && (
                      <p className="text-gray-400 text-xs">{t.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2">Milestones</h3>
              <ul className="space-y-2">
                {knowledge.milestones.map((m, i) => (
                  <li key={i} className="text-sm border-l-2 border-green-300 pl-3">
                    <span className="font-medium">{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Plan Link */}
      {goal.active_plan_id && (
        <Link
          href={`/goals/${goalId}/plan`}
          className="block p-4 border rounded-lg bg-blue-50 hover:bg-blue-100 transition"
        >
          <span className="font-medium">📋 View Active Plan →</span>
        </Link>
      )}

      {/* YouTube Transcripts */}
      {knowledge && knowledge.resource_refs && knowledge.resource_refs.filter((r) => r.source_type === "youtube" && r.transcript).length > 0 && (
        <div className="border rounded-lg p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">YouTube Transcripts</h2>
          <div className="space-y-3">
            {knowledge.resource_refs
              .filter((r) => r.source_type === "youtube" && r.transcript)
              .map((r) => (
                <details key={r.ref_id} className="border rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-50 font-medium text-sm">
                    🎬 {r.title}
                  </summary>
                  <div className="p-3 pt-0">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline text-xs"
                    >
                      {r.url}
                    </a>
                    <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap max-h-64 overflow-y-auto bg-gray-50 p-3 rounded">
                      {r.transcript}
                    </pre>
                  </div>
                </details>
              ))}
          </div>
        </div>
      )}

      {/* Materials */}
      <div className="border rounded-lg p-6 bg-white">
        <h2 className="text-lg font-semibold mb-2">Materials</h2>
        {goal.material_urls.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {goal.material_urls.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400 text-sm">No URLs attached</p>
        )}
        {goal.uploaded_file_ids.length > 0 && (
          <p className="text-sm mt-2 text-gray-500">
            {goal.uploaded_file_ids.length} file(s) uploaded
          </p>
        )}
      </div>
    </div>
  );
}
