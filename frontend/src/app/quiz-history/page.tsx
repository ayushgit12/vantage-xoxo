"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";

import { getQuizHistory, type QuizAttempt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getScoreColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 60) return "text-amber-600";
  return "text-rose-600";
}

function getScoreBg(pct: number) {
  if (pct >= 80) return "bg-gradient-to-r from-emerald-400 to-emerald-600";
  if (pct >= 60) return "bg-gradient-to-r from-amber-400 to-amber-600";
  return "bg-gradient-to-r from-rose-400 to-rose-600";
}

function getScoreRingBg(pct: number) {
  if (pct >= 80) return "from-emerald-100 to-emerald-50 border-emerald-200";
  if (pct >= 60) return "from-amber-100 to-amber-50 border-amber-200";
  return "from-rose-100 to-rose-50 border-rose-200";
}

function getScoreEmoji(pct: number) {
  if (pct === 100) return "🏆";
  if (pct >= 80) return "🎉";
  if (pct >= 60) return "👍";
  if (pct >= 40) return "📚";
  return "💪";
}

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case "easy": return "bg-emerald-100 text-emerald-700";
    case "hard": return "bg-rose-100 text-rose-700";
    default: return "bg-amber-100 text-amber-700";
  }
}

function groupByMonth(attempts: QuizAttempt[]): { label: string; attempts: QuizAttempt[] }[] {
  const groups: Map<string, QuizAttempt[]> = new Map();
  for (const a of attempts) {
    const d = new Date(a.completed_at);
    const key = `${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  return Array.from(groups.entries()).map(([label, attempts]) => ({ label, attempts }));
}

export default function QuizHistoryPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    getQuizHistory()
      .then(setAttempts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = attempts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "high") return a.score_pct >= 80;
    if (filter === "medium") return a.score_pct >= 50 && a.score_pct < 80;
    if (filter === "low") return a.score_pct < 50;
    return true;
  });

  const groups = groupByMonth(filtered);

  // Stats
  const totalQuizzes = attempts.length;
  const avgScore =
    totalQuizzes > 0
      ? Math.round(attempts.reduce((sum, a) => sum + a.score_pct, 0) / totalQuizzes)
      : 0;
  const totalQuestions = attempts.reduce((sum, a) => sum + a.score_total, 0);
  const totalCorrect = attempts.reduce((sum, a) => sum + a.score_correct, 0);
  const bestScore = totalQuizzes > 0 ? Math.max(...attempts.map((a) => a.score_pct)) : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Knowledge Assessment
        </p>
        <h1 className="text-3xl font-bold text-zinc-900">Quiz History</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Review your past quiz attempts and track your learning progress.
        </p>
      </div>

      {/* Stats Row */}
      {!loading && totalQuizzes > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                <Brain className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Total Quizzes
              </p>
            </div>
            <p className="text-2xl font-bold text-zinc-900">{totalQuizzes}</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Avg Score
              </p>
            </div>
            <p className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}%</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Trophy className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Best Score
              </p>
            </div>
            <p className={`text-2xl font-bold ${getScoreColor(bestScore)}`}>{bestScore}%</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Questions
              </p>
            </div>
            <p className="text-2xl font-bold text-zinc-900">
              {totalCorrect}
              <span className="text-base font-normal text-zinc-400">/{totalQuestions}</span>
            </p>
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "high", "medium", "low"] as const).map((f) => {
          const labels = { all: "All", high: "80%+", medium: "50-79%", low: "Below 50%" };
          return (
            <Button
              key={f}
              onClick={() => setFilter(f)}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="rounded-full capitalize"
            >
              {labels[f]}
            </Button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && attempts.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100">
            <Brain className="h-8 w-8 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-1">No quizzes yet</h3>
          <p className="text-sm text-zinc-500 max-w-xs mx-auto mb-6">
            Take your first quiz from the Master Calendar to start tracking your progress.
          </p>
          <Button asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <Link href="/goals">
              <Sparkles className="h-4 w-4 mr-2" />
              Go to Calendar
            </Link>
          </Button>
        </div>
      )}

      {/* No results for filter */}
      {!loading && attempts.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-zinc-500">No quizzes match this filter.</p>
        </div>
      )}

      {/* Timeline */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-10">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                  {group.label}
                </h2>
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-xs text-zinc-500">
                  {group.attempts.length} quiz{group.attempts.length > 1 ? "zes" : ""}
                </span>
              </div>

              {/* Quiz cards */}
              <div className="ml-[5px] space-y-3 border-l border-zinc-200 pl-7">
                {group.attempts.map((attempt) => {
                  const isExpanded = expandedId === attempt.quiz_id;
                  return (
                    <div key={attempt.quiz_id} className="relative">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[33px] top-5 h-2 w-2 rounded-full transition ${
                          isExpanded ? "bg-indigo-600" : "bg-zinc-300"
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : attempt.quiz_id)}
                        className="w-full text-left"
                      >
                        <div
                          className={`rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                            isExpanded ? "border-indigo-200 ring-1 ring-indigo-100" : "border-zinc-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            {/* Left: score ring + info */}
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <div
                                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${getScoreRingBg(
                                  attempt.score_pct
                                )}`}
                              >
                                <span className={`text-lg font-bold ${getScoreColor(attempt.score_pct)}`}>
                                  {attempt.score_pct}%
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-semibold text-zinc-900 truncate">
                                    {attempt.topics.join(", ")}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Quiz for {formatDate(attempt.date)}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDateTime(attempt.completed_at)}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {attempt.score_correct}/{attempt.score_total} correct
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right: score bar + chevron */}
                            <div className="flex items-center gap-3">
                              <div className="hidden sm:block w-24">
                                <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getScoreBg(attempt.score_pct)}`}
                                    style={{ width: `${attempt.score_pct}%` }}
                                  />
                                </div>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-zinc-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-zinc-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm animate-fade-in">
                          {/* Topic badges */}
                          <div className="mb-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                              Topics Covered
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {attempt.topics.map((topic) => (
                                <span
                                  key={topic}
                                  className="rounded-md bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Questions */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                              Questions ({attempt.score_correct}/{attempt.score_total} correct)
                            </p>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                              {attempt.questions.map((q) => {
                                const userAnswer = attempt.answers[String(q.question_id)];
                                const isCorrect = userAnswer === q.correct_answer;
                                return (
                                  <div
                                    key={q.question_id}
                                    className={`rounded-lg border p-3 ${
                                      isCorrect
                                        ? "border-emerald-200 bg-emerald-50/40"
                                        : "border-rose-200 bg-rose-50/40"
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5">
                                      <div className="pt-0.5 shrink-0">
                                        {isCorrect ? (
                                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-rose-600" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-[13px] font-medium text-zinc-800 leading-snug">
                                            {q.question}
                                          </p>
                                          <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${getDifficultyColor(
                                              q.difficulty
                                            )}`}
                                          >
                                            {q.difficulty}
                                          </span>
                                        </div>
                                        {!isCorrect && (
                                          <div className="mt-1.5 space-y-0.5 text-[12px]">
                                            <p className="text-rose-600">
                                              Your answer:{" "}
                                              <span className="font-medium">
                                                {userAnswer} —{" "}
                                                {q.options.find((o) => o.label === userAnswer)?.text || ""}
                                              </span>
                                            </p>
                                            <p className="text-emerald-700">
                                              Correct:{" "}
                                              <span className="font-medium">
                                                {q.correct_answer} —{" "}
                                                {q.options.find((o) => o.label === q.correct_answer)?.text || ""}
                                              </span>
                                            </p>
                                          </div>
                                        )}
                                        <p className="mt-1.5 text-[12px] text-zinc-500 italic leading-snug">
                                          {q.explanation}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
