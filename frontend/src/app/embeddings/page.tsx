"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/env";
import EmbeddingsScene from "@/app/embeddings/EmbeddingsScene";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCardsSkeleton, TableRowsSkeleton } from "@/components/ui/app-skeletons";

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
    <Card className="animate-in slide-in-from-right-2 border border-zinc-200 bg-white shadow-sm duration-300">
      <CardContent className="space-y-4 p-5">
        <h3 className="mb-1 text-base font-semibold leading-tight text-zinc-900">{point.title}</h3>
        {point.goal_title && (
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{point.goal_title}</p>
        )}
        <p className="mb-4 text-xs leading-relaxed text-zinc-600">{point.description || "No description available"}</p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Est. Hours</p>
            <p className="text-sm font-semibold text-zinc-900">{point.est_hours}h</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Coordinates</p>
            <p className="font-mono text-[11px] text-zinc-600">
              {point.x.toFixed(2)}, {point.y.toFixed(2)}, {point.z.toFixed(2)}
            </p>
          </div>
        </div>

        {point.neighbors.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Nearest Neighbors</p>
            <div className="space-y-1.5">
              {point.neighbors.map((n) => {
                const nPoint = data.points.find((p) => p.topic_id === n.topic_id);
                return (
                  <div key={n.topic_id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5">
                    <span className="mr-2 truncate text-xs text-zinc-700">{nPoint?.title || n.topic_id.slice(0, 8)}</span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">{(n.similarity * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
        <div key={s.label} className="flex items-baseline gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</span>
          <span className="text-xs font-semibold text-zinc-900">{s.value}</span>
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
    <div className="mx-auto max-w-[1300px] space-y-6 px-6 py-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-10%] top-[-20%] h-[60%] w-[60%] rounded-full bg-zinc-200/50 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[50%] w-[50%] rounded-full bg-zinc-300/35 blur-[140px]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Knowledge Graph</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-900">Embedding Space</h1>
          <p className="mt-1 text-sm text-zinc-600">Explore topic clusters and semantic neighbors across goals.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/goals">Back to goals</Link>
          </Button>
        </div>
      </div>

      <Card className="border border-zinc-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Visualization Controls</CardTitle>
          <CardDescription>Choose scope and inspect clusters in 3D.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-sm">
            <Select value={selectedGoal} onValueChange={setSelectedGoal}>
              <SelectTrigger>
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Goals</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.goal_id} value={g.goal_id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="relative min-h-[620px] border border-zinc-200 bg-white shadow-sm">
          <CardContent className="h-[620px] p-0">
          {loading ? (
            <div className="space-y-4 p-6">
              <DashboardCardsSkeleton />
              <TableRowsSkeleton rows={8} />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-center">
                <p className="mb-1 text-sm text-red-700">{error}</p>
                <p className="text-xs text-red-600">Try selecting a goal with parsed topics.</p>
              </div>
            </div>
          ) : data ? (
            <>
              <EmbeddingsScene data={data} onPointHover={handlePointHover} />

              <div className="absolute bottom-5 left-5 z-20">
                <StatsBar data={data} />
              </div>

              <div className="absolute bottom-5 right-5 z-20 space-y-0.5 text-right text-[10px] text-zinc-500">
                <p>Drag to rotate · Scroll to zoom</p>
                <p>Hover a node for details</p>
              </div>
            </>
          ) : null}
          </CardContent>
        </Card>

        <div className="min-h-[620px]">
          {hoveredPoint && data ? (
            <DetailCard point={hoveredPoint} data={data} />
          ) : (
            <Card className="h-full border border-dashed border-zinc-300 bg-white/70 shadow-sm">
              <CardContent className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
                Hover any node to inspect details and nearest neighbors.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
