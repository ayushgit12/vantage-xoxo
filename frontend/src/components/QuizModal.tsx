"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
  Trophy,
  XCircle,
  RotateCcw,
  BookOpen,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  generateQuiz,
  saveQuizAttempt,
  type QuizQuestion,
  type QuizResponse,
} from "@/lib/api";

interface QuizModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string | null;
}

type QuizState = "idle" | "loading" | "active" | "review" | "complete";

export function QuizModal({ open, onClose, selectedDate }: QuizModalProps) {
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion: QuizQuestion | null =
    quiz && quiz.questions[currentIndex] ? quiz.questions[currentIndex] : null;

  const score = useMemo(() => {
    if (!quiz) return { correct: 0, total: 0, pct: 0 };
    let correct = 0;
    for (const q of quiz.questions) {
      if (answers[q.question_id] === q.correct_answer) correct++;
    }
    const total = quiz.questions.length;
    return { correct, total, pct: total > 0 ? Math.round((correct / total) * 100) : 0 };
  }, [quiz, answers]);

  const handleStartQuiz = useCallback(async () => {
    if (!selectedDate) return;
    setQuizState("loading");
    setError(null);
    try {
      const result = await generateQuiz(selectedDate);
      setQuiz(result);
      setCurrentIndex(0);
      setAnswers({});
      setSelectedAnswer(null);
      setShowExplanation(false);
      setQuizState("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate quiz");
      setQuizState("idle");
    }
  }, [selectedDate]);

  const handleSelectOption = useCallback(
    (label: string) => {
      if (showExplanation || !currentQuestion) return;
      setSelectedAnswer(label);
    },
    [showExplanation, currentQuestion]
  );

  const handleConfirm = useCallback(() => {
    if (!currentQuestion || !selectedAnswer) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.question_id]: selectedAnswer }));
    setShowExplanation(true);
  }, [currentQuestion, selectedAnswer]);

  const handleNext = useCallback(() => {
    if (!quiz) return;
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setQuizState("complete");
    }
  }, [quiz, currentIndex]);

  // Auto-save quiz results when completed
  const hasSaved = useRef(false);
  useEffect(() => {
    if (quizState !== "complete" || !quiz || hasSaved.current) return;
    hasSaved.current = true;
    const answersStr: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) {
      answersStr[String(k)] = v;
    }
    saveQuizAttempt({
      date: quiz.date,
      topics: quiz.topics,
      questions: quiz.questions,
      answers: answersStr,
      score_correct: score.correct,
      score_total: score.total,
      score_pct: score.pct,
    }).catch((err) => console.error("Failed to save quiz:", err));
  }, [quizState, quiz, answers, score]);

  const handleRetry = useCallback(() => {
    if (!quiz) return;
    hasSaved.current = false;
    setCurrentIndex(0);
    setAnswers({});
    setSelectedAnswer(null);
    setShowExplanation(false);
    setQuizState("active");
  }, [quiz]);

  const handleClose = useCallback(() => {
    setQuizState("idle");
    setQuiz(null);
    setCurrentIndex(0);
    setAnswers({});
    setSelectedAnswer(null);
    setShowExplanation(false);
    setError(null);
    hasSaved.current = false;
    onClose();
  }, [onClose]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "hard": return "bg-rose-100 text-rose-700 border-rose-200";
      default: return "bg-amber-100 text-amber-700 border-amber-200";
    }
  };

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return "text-emerald-600";
    if (pct >= 60) return "text-amber-600";
    return "text-rose-600";
  };

  const getScoreEmoji = (pct: number) => {
    if (pct === 100) return "🏆";
    if (pct >= 80) return "🎉";
    if (pct >= 60) return "👍";
    if (pct >= 40) return "📚";
    return "💪";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-white"
        showCloseButton={true}
      >
        {/* ── Idle / Start Screen ── */}
        {quizState === "idle" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Daily Knowledge Quiz</DialogTitle>
                  <DialogDescription>
                    Test your understanding of today&apos;s scheduled topics
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-col items-center py-8 text-center">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-indigo-600" />
                </div>
                <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">AI</span>
                </div>
              </div>

              <h3 className="text-base font-semibold text-zinc-900 mb-1">
                Ready to test your knowledge?
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mb-6">
                An AI-powered quiz will be generated from the topics assigned for this
                day. 10-15 multiple choice questions covering key concepts.
              </p>

              {error && (
                <div className="mb-4 w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <Button
                onClick={handleStartQuiz}
                className="h-11 px-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 transition-all duration-200 hover:scale-[1.02]"
                disabled={!selectedDate}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Quiz
              </Button>
            </div>
          </>
        )}

        {/* ── Loading State ── */}
        {quizState === "loading" && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center animate-pulse">
                <Brain className="h-8 w-8 text-indigo-600" />
              </div>
              <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 text-indigo-600 animate-spin" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Crafting your quiz...</p>
            <p className="text-xs text-zinc-400 mt-1">
              Analyzing topics and generating questions
            </p>
          </div>
        )}

        {/* ── Active Quiz ── */}
        {quizState === "active" && currentQuestion && quiz && (
          <>
            <DialogHeader className="pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                    <BookOpen className="h-3.5 w-3.5 text-white" />
                  </div>
                  <DialogTitle className="text-sm font-semibold">
                    Question {currentIndex + 1}
                    <span className="text-zinc-400 font-normal"> / {quiz.questions.length}</span>
                  </DialogTitle>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getDifficultyColor(
                    currentQuestion.difficulty
                  )}`}
                >
                  {currentQuestion.difficulty}
                </span>
              </div>
            </DialogHeader>

            {/* Progress bar */}
            <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${((currentIndex + (showExplanation ? 1 : 0)) / quiz.questions.length) * 100}%`,
                }}
              />
            </div>

            {/* Topic badge */}
            <div className="flex items-center gap-1.5 -mt-1">
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {currentQuestion.topic_title}
              </span>
            </div>

            {/* Question */}
            <div className="overflow-y-auto flex-1 -mx-4 px-4 space-y-3 pb-2">
              <p className="text-[15px] font-medium text-zinc-900 leading-relaxed">
                {currentQuestion.question}
              </p>

              {/* Options */}
              <div className="space-y-2">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedAnswer === opt.label;
                  const isCorrect = opt.label === currentQuestion.correct_answer;
                  const isWrong = showExplanation && isSelected && !isCorrect;
                  const isRight = showExplanation && isCorrect;

                  let optStyle =
                    "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50";
                  if (isSelected && !showExplanation) {
                    optStyle =
                      "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200";
                  }
                  if (isRight) {
                    optStyle =
                      "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200";
                  }
                  if (isWrong) {
                    optStyle = "border-rose-400 bg-rose-50 ring-1 ring-rose-200";
                  }

                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleSelectOption(opt.label)}
                      disabled={showExplanation}
                      className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${optStyle} ${
                        showExplanation ? "cursor-default" : "cursor-pointer"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                          isSelected && !showExplanation
                            ? "bg-indigo-600 text-white"
                            : isRight
                            ? "bg-emerald-600 text-white"
                            : isWrong
                            ? "bg-rose-600 text-white"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {isRight ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isWrong ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          opt.label
                        )}
                      </span>
                      <span className="text-sm text-zinc-800 pt-0.5 leading-relaxed">
                        {opt.text}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {showExplanation && (
                <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 px-4 py-3 animate-fade-in">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">
                    Explanation
                  </p>
                  <p className="text-sm text-zinc-700 leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <p className="text-xs text-zinc-400">
                {Object.keys(answers).length} of {quiz.questions.length} answered
              </p>
              {!showExplanation ? (
                <Button
                  onClick={handleConfirm}
                  disabled={!selectedAnswer}
                  className="h-9 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all"
                >
                  Confirm
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="h-9 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all"
                >
                  {currentIndex < quiz.questions.length - 1 ? (
                    <>
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    <>
                      See Results <Trophy className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        )}

        {/* ── Complete / Results ── */}
        {quizState === "complete" && quiz && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Quiz Complete!</DialogTitle>
                  <DialogDescription>
                    Here&apos;s how you did on today&apos;s topics
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 -mx-4 px-4 space-y-5 pb-2">
              {/* Score Card */}
              <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-6 text-center shadow-sm">
                <p className="text-4xl mb-1">{getScoreEmoji(score.pct)}</p>
                <p className={`text-4xl font-bold ${getScoreColor(score.pct)}`}>
                  {score.pct}%
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {score.correct} of {score.total} correct
                </p>
                <div className="mt-4 w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      score.pct >= 80
                        ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                        : score.pct >= 60
                        ? "bg-gradient-to-r from-amber-400 to-amber-600"
                        : "bg-gradient-to-r from-rose-400 to-rose-600"
                    }`}
                    style={{ width: `${score.pct}%` }}
                  />
                </div>
              </div>

              {/* Topics covered */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Topics Covered
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quiz.topics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-md bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

              {/* Question Review */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Question Review
                </p>
                <div className="space-y-1.5">
                  {quiz.questions.map((q) => {
                    const userAnswer = answers[q.question_id];
                    const isCorrect = userAnswer === q.correct_answer;
                    return (
                      <div
                        key={q.question_id}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                          isCorrect
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-rose-200 bg-rose-50/50"
                        }`}
                      >
                        <div className="pt-0.5">
                          {isCorrect ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-zinc-800 text-[13px] leading-snug line-clamp-2">
                            {q.question}
                          </p>
                          {!isCorrect && (
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Your answer: {userAnswer} · Correct: {q.correct_answer}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button
                variant="outline"
                onClick={handleRetry}
                className="h-9 border-zinc-300"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
              <Button
                onClick={handleStartQuiz}
                className="h-9 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                New Quiz
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
