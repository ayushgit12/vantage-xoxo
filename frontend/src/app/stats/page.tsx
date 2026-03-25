"use client";

import { useEffect, useMemo, useState } from "react";

import { getPlannerStats, type PlannerStatsResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCardsSkeleton, TableRowsSkeleton } from "@/components/ui/app-skeletons";

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
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <DashboardCardsSkeleton />
        <TableRowsSkeleton rows={6} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Card className="border border-red-200 bg-red-50/50 p-6 text-sm text-red-700">
          <CardContent>{error || "Planner stats unavailable"}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Planner Intelligence</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">Planner Stats</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          This view tracks planning output quality and execution outcomes. It is the baseline dashboard for the AI-enhanced planner rollout.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">Total Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{stats.total_plans}</p>
            <p className="mt-2 text-xs text-zinc-600">Avg blocks/plan: {stats.avg_blocks_per_plan}</p>
          </CardContent>
        </Card>
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">Execution Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{pct(stats.completion_ratio)}</p>
            <p className="mt-2 text-xs text-zinc-600">Miss ratio: {pct(stats.miss_ratio)}</p>
          </CardContent>
        </Card>
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-zinc-500">Quality Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-zinc-900">{qualityState}</p>
            <p className="mt-2 text-xs text-zinc-600">
            Avg quality score: {stats.avg_quality_score === null ? "N/A" : stats.avg_quality_score}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Block Status Mix</CardTitle>
          </CardHeader>
          <CardContent className="mt-0 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-zinc-500">Scheduled</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.scheduled_blocks}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-zinc-500">Done</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.done_blocks}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-zinc-500">Partial</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.partial_blocks}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-zinc-500">Missed</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.missed_blocks}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">AI/Quality Coverage</CardTitle>
            <CardDescription>Rollout observability for AI planner signals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Plans with quality score</span>
              <span className="font-semibold text-zinc-900">{stats.quality_score_available}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Plans with disruption index</span>
              <span className="font-semibold text-zinc-900">{stats.disruption_index_available}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Avg disruption index</span>
              <span className="font-semibold text-zinc-900">
                {stats.avg_disruption_index === null ? "N/A" : stats.avg_disruption_index}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Estimated hours tracked</span>
              <span className="font-semibold text-zinc-900">{stats.estimated_hours_total}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Avg AI confidence</span>
              <span className="font-semibold text-zinc-900">
                {stats.avg_ai_confidence === null ? "N/A" : stats.avg_ai_confidence}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Fallback used count</span>
              <span className="font-semibold text-zinc-900">{stats.used_fallback_count}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="text-zinc-500">Retry triggered count</span>
              <span className="font-semibold text-zinc-900">{stats.retry_triggered_count}</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
