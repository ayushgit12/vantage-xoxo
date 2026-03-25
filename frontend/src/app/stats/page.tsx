"use client";

import { useEffect, useMemo, useState } from "react";

import { getPlannerStats, type PlannerStatsResponse } from "@/lib/api";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function PlannerStatsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlannerStatsResponse | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPlannerStats();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load planner stats");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const qualityState = useMemo(() => {
    if (!stats || stats.avg_quality_score === null) return "Not available yet";
    if (stats.avg_quality_score >= 80) return "Strong";
    if (stats.avg_quality_score >= 60) return "Needs tuning";
    return "At risk";
  }, [stats]);

  if (loading) {
    return <div className="mx-auto max-w-5xl p-8 text-center text-slate-500">Loading planner stats...</div>;
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="glass-card p-6 text-sm text-red-300">{error || "Planner stats unavailable"}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Planner Intelligence</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-cyan-50">Planner Stats</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          This view tracks planning output quality and execution outcomes. It is the baseline dashboard for the AI-enhanced planner rollout.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500">Total Plans</p>
          <p className="mt-2 text-3xl font-bold text-cyan-100">{stats.total_plans}</p>
          <p className="mt-2 text-xs text-slate-400">Avg blocks/plan: {stats.avg_blocks_per_plan}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500">Execution Completion</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{pct(stats.completion_ratio)}</p>
          <p className="mt-2 text-xs text-slate-400">Miss ratio: {pct(stats.miss_ratio)}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500">Quality Status</p>
          <p className="mt-2 text-3xl font-bold text-cyan-100">{qualityState}</p>
          <p className="mt-2 text-xs text-slate-400">
            Avg quality score: {stats.avg_quality_score === null ? "N/A" : stats.avg_quality_score}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-cyan-50">Block Status Mix</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-slate-400">Scheduled</p>
              <p className="mt-1 text-xl font-semibold text-cyan-100">{stats.scheduled_blocks}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-slate-400">Done</p>
              <p className="mt-1 text-xl font-semibold text-emerald-300">{stats.done_blocks}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-slate-400">Partial</p>
              <p className="mt-1 text-xl font-semibold text-amber-300">{stats.partial_blocks}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-slate-400">Missed</p>
              <p className="mt-1 text-xl font-semibold text-rose-300">{stats.missed_blocks}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-cyan-50">AI/Quality Coverage</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Plans with quality score</span>
              <span className="font-semibold text-cyan-100">{stats.quality_score_available}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Plans with disruption index</span>
              <span className="font-semibold text-cyan-100">{stats.disruption_index_available}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Avg disruption index</span>
              <span className="font-semibold text-cyan-100">
                {stats.avg_disruption_index === null ? "N/A" : stats.avg_disruption_index}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Estimated hours tracked</span>
              <span className="font-semibold text-cyan-100">{stats.estimated_hours_total}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Avg AI confidence</span>
              <span className="font-semibold text-cyan-100">
                {stats.avg_ai_confidence === null ? "N/A" : stats.avg_ai_confidence}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Fallback used count</span>
              <span className="font-semibold text-cyan-100">{stats.used_fallback_count}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
              <span className="text-slate-400">Retry triggered count</span>
              <span className="font-semibold text-cyan-100">{stats.retry_triggered_count}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
