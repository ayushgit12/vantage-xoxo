"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/env";
import EmbeddingsScene from "@/app/embeddings/EmbeddingsScene";

/* ── Types ─────────────────────────────────────────── */
interface EmbeddingPoint {
  topic_id: string;
  title: string;
  description: string;
  est_hours: number;
  prereq_ids: string[];
  goal_id?: string;
  goal_title?: string;
  x: number;
  y: number;
  z: number;
  neighbors: { topic_id: string; similarity: number }[];
}

interface Edge {
  from: string;
  to: string;
  type: "prereq" | "similar";
  weight?: number;
}

interface EmbeddingData {
  points: EmbeddingPoint[];
  edges: Edge[];
  dimensions: number;
  variance_explained: number;
  total_topics: number;
  embedding_model: string;
  original_dims: number;
  goal_title?: string;
  goal_id?: string;
  goals_count?: number;
}

interface GoalOption {
  goal_id: string;
  title: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "X-User-Id": "demo-user-001" },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}

/* ── Detail Card ───────────────────────────────────── */
function DetailCard({ point, data }: { point: EmbeddingPoint; data: EmbeddingData }) {
  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 shadow-2xl shadow-cyan-500/5">
        <h3 className="text-base font-semibold text-cyan-50 mb-1 leading-tight">{point.title}</h3>
        {point.goal_title && (
          <p className="text-[11px] text-cyan-400/70 font-medium tracking-wide uppercase mb-3">{point.goal_title}</p>
        )}
        <p className="text-xs text-slate-400 leading-relaxed mb-4">{point.description || "No description available"}</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Est. Hours</p>
            <p className="text-sm font-semibold text-cyan-300">{point.est_hours}h</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Coordinates</p>
            <p className="text-[11px] font-mono text-slate-400">
              {point.x.toFixed(2)}, {point.y.toFixed(2)}, {point.z.toFixed(2)}
            </p>
          </div>
        </div>

        {point.neighbors.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Nearest Neighbors</p>
            <div className="space-y-1.5">
              {point.neighbors.map((n) => {
                const nPoint = data.points.find((p) => p.topic_id === n.topic_id);
                return (
                  <div key={n.topic_id} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-1.5 border border-white/[0.04]">
                    <span className="text-xs text-slate-300 truncate mr-2">{nPoint?.title || n.topic_id.slice(0, 8)}</span>
                    <span className="text-[10px] font-mono text-cyan-400/80 shrink-0">{(n.similarity * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stats Bar ─────────────────────────────────────── */
function StatsBar({ data }: { data: EmbeddingData }) {
  const stats = [
    { label: "Topics", value: data.total_topics },
    { label: "Variance", value: `${(data.variance_explained * 100).toFixed(1)}%` },
    { label: "Edges", value: data.edges.length },
    { label: "Dims", value: `${data.original_dims} → ${data.dimensions}` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {stats.map((s) => (
        <div key={s.label} className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2 flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</span>
          <span className="text-xs font-semibold text-cyan-300">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────── */
export default function EmbeddingsPage() {
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<string>("all");
  const [data, setData] = useState<EmbeddingData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<EmbeddingPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<GoalOption[]>("/api/goals")
      .then((g) => setGoals(g))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setHoveredPoint(null);

    const url =
      selectedGoal === "all"
        ? "/api/embeddings/all?dims=3"
        : `/api/embeddings/goal/${selectedGoal}?dims=3`;

    apiFetch<EmbeddingData>(url)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedGoal]);

  const handlePointHover = useCallback((p: EmbeddingPoint | null) => setHoveredPoint(p), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#060a18]">
      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/[0.05] blur-[120px]" />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full bg-purple-500/[0.03] blur-[80px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-lg font-bold text-white/90 hover:text-white transition">
            Vantage
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="text-sm font-medium text-cyan-300/80 tracking-wide">Embedding Space</h1>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedGoal}
            onChange={(e) => setSelectedGoal(e.target.value)}
            className="bg-white/[0.06] border border-white/[0.1] text-cyan-100 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-cyan-500/40 transition cursor-pointer appearance-none"
          >
            <option value="all" className="bg-[#0f172a]">All Goals</option>
            {goals.map((g) => (
              <option key={g.goal_id} value={g.goal_id} className="bg-[#0f172a]">
                {g.title}
              </option>
            ))}
          </select>

          <Link
            href="/goals"
            className="text-xs text-slate-500 hover:text-cyan-400 transition"
          >
            ← Goals
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 h-[calc(100vh-57px)] flex">
        {/* 3D Canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
                <p className="text-cyan-300/50 text-sm tracking-widest uppercase">Computing embeddings…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
                  </svg>
                </div>
                <p className="text-red-400/80 text-sm mb-1">{error}</p>
                <p className="text-slate-600 text-xs">Try selecting a goal with parsed topics</p>
              </div>
            </div>
          ) : data ? (
            <>
              <EmbeddingsScene data={data} onPointHover={handlePointHover} />

              {/* Bottom stats */}
              <div className="absolute bottom-5 left-5 z-20">
                <StatsBar data={data} />
              </div>

              {/* Interaction hint */}
              <div className="absolute bottom-5 right-5 z-20 text-[10px] text-slate-600 space-y-0.5 text-right">
                <p>Drag to rotate · Scroll to zoom</p>
                <p>Hover a node for details</p>
              </div>
            </>
          ) : null}
        </div>

        {/* Detail sidebar */}
        <div
          className={`w-80 shrink-0 border-l border-white/[0.06] p-5 overflow-y-auto transition-all duration-300 ${
            hoveredPoint ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
          }`}
        >
          {hoveredPoint && data && <DetailCard point={hoveredPoint} data={data} />}
        </div>
      </div>
    </div>
  );
}
