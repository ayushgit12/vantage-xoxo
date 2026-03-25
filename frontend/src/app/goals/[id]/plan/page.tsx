"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CircleSlash, Clock3, Minus } from "lucide-react";
import {
  getPlanForGoal,
  getKnowledge,
  updateBlockStatus,
  type Plan,
  type MicroBlock,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCardsSkeleton, TableRowsSkeleton } from "@/components/ui/app-skeletons";

const STATUS_BADGE: Record<string, "secondary" | "outline" | "destructive"> = {
  scheduled: "outline",
  done: "secondary",
  partial: "outline",
  missed: "destructive",
  cancelled: "destructive",
};

export default function PlanPage() {
  const params = useParams();
  const goalId = params.id as string;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [topicMap, setTopicMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, k] = await Promise.all([
          getPlanForGoal(goalId),
          getKnowledge(goalId).catch(() => null),
        ]);
        setPlan(p);
        if (k) {
          const map: Record<string, string> = {};
          k.topics.forEach((t) => {
            map[t.topic_id] = t.title;
          });
          setTopicMap(map);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [goalId]);

  async function handleStatusChange(blockId: string, status: string) {
    try {
      await updateBlockStatus(blockId, status);
      const updated = await getPlanForGoal(goalId);
      setPlan(updated);
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <DashboardCardsSkeleton />
        <TableRowsSkeleton rows={8} />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardContent className="py-10 text-center text-sm text-zinc-600">
            No plan found. Generate one first.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group blocks by date
  const blocksByDate = plan.micro_blocks.reduce(
    (acc, block) => {
      const date = new Date(block.start_dt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
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
  const completionPct = totalMin > 0 ? (doneMin / totalMin) * 100 : 0;

  function statusIcon(status: string) {
    if (status === "done") return <Check className="h-3.5 w-3.5" />;
    if (status === "partial") return <Minus className="h-3.5 w-3.5" />;
    if (status === "missed" || status === "cancelled") return <CircleSlash className="h-3.5 w-3.5" />;
    return <Clock3 className="h-3.5 w-3.5" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-zinc-200 bg-white shadow-sm md:col-span-2">
          <CardHeader>
            <CardTitle>Study Plan</CardTitle>
            <CardDescription>
              {plan.micro_blocks.length} blocks, {(totalMin / 60).toFixed(1)}h total, {(doneMin / 60).toFixed(1)}h complete
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-zinc-200">
              <div
                className="h-2 rounded-full bg-zinc-900 transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-zinc-600">{completionPct.toFixed(1)}% complete</p>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Scheduled</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">
              {plan.micro_blocks.filter((b) => b.status === "scheduled").length}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Done</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">
              {plan.micro_blocks.filter((b) => b.status === "done").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {plan.explanation ? (
        <Card className="border border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Planner Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-700">{plan.explanation}</CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {Object.entries(blocksByDate).map(([date, blocks]) => (
          <Card key={date} className="border border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{date}</CardTitle>
              <CardDescription>{blocks.length} scheduled block(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {blocks.map((block) => {
                const topicName = topicMap[block.topic_id] || block.topic_id.slice(0, 8);
                const startTime = new Date(block.start_dt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const endTime = new Date(
                  new Date(block.start_dt).getTime() + block.duration_min * 60000
                ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                return (
                  <div
                    key={block.block_id}
                    className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-28 text-xs font-medium text-zinc-600">
                        {startTime} - {endTime}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{topicName}</p>
                        <p className="text-xs text-zinc-500">{block.duration_min} min</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_BADGE[block.status] ?? "outline"} className="capitalize">
                        <span className="mr-1">{statusIcon(block.status)}</span>
                        {block.status}
                      </Badge>
                      {block.status === "scheduled" ? (
                        <>
                          <Button size="xs" onClick={() => handleStatusChange(block.block_id, "done")}>
                            Done
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleStatusChange(block.block_id, "partial")}
                          >
                            Partial
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => handleStatusChange(block.block_id, "missed")}
                          >
                            Missed
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
