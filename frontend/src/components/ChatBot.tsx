"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BACKEND_URL } from "@/lib/env";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface GoalDraftFromChat {
  scenario: string;
  deadline?: string;
}

const GOAL_ACK_DELAY_MS = 700;
const GOAL_REDIRECT_DELAY_MS = 900;

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(base: Date, months: number): Date {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(base: Date, years: number): Date {
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function parseRelativeDateToIso(input: string): string | null {
  const text = input.toLowerCase().trim();
  if (!text) return null;

  const now = new Date();

  if (/\bday after tomorrow\b/.test(text)) {
    return toIsoDate(addDays(now, 2));
  }
  if (/\btomorrow\b/.test(text)) {
    return toIsoDate(addDays(now, 1));
  }

  const inMatch = text.match(/\bin\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (inMatch) {
    const qty = Number(inMatch[1]);
    const unit = inMatch[2];
    if (Number.isFinite(qty) && qty > 0) {
      if (unit.startsWith("day")) return toIsoDate(addDays(now, qty));
      if (unit.startsWith("week")) return toIsoDate(addDays(now, qty * 7));
      if (unit.startsWith("month")) return toIsoDate(addMonths(now, qty));
      if (unit.startsWith("year")) return toIsoDate(addYears(now, qty));
    }
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const nextWeekdayMatch = text.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextWeekdayMatch) {
    const target = weekdays.indexOf(nextWeekdayMatch[1]);
    if (target >= 0) {
      const current = now.getDay();
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      return toIsoDate(addDays(now, delta));
    }
  }

  return null;
}

function parseDateToIso(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  const relative = parseRelativeDateToIso(trimmed);
  if (relative) {
    return relative;
  }

  return null;
}

function extractGoalDraftFromMessage(text: string): GoalDraftFromChat | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const intentPatterns = [
    /(?:please\s+)?(?:create|add|make)\s+(?:me\s+)?(?:a\s+)?goal\b/i,
    /(?:please\s+)?set\s+(?:me\s+)?(?:a\s+)?goal\b/i,
    /(?:please\s+)?new\s+goal\b/i,
    /(?:please\s+)?goal\s+for\b/i,
    /(?:please\s+)?goal\s+to\b/i,
    /(?:please\s+)?help\s+me\s+plan\b/i,
    /(?:please\s+)?plan\s+(?:a\s+)?goal\b/i,
  ];
  const hasCreateIntent = intentPatterns.some((pattern) => pattern.test(normalized));
  if (!hasCreateIntent) return null;

  let scenario = normalized
    .replace(/^(please\s+)?(create|add|make)\s+(me\s+)?(a\s+)?goal\s*(of|for|to)?\s*/i, "")
    .replace(/^(please\s+)?set\s+(me\s+)?(a\s+)?goal\s*(of|for|to)?\s*/i, "")
    .replace(/^(please\s+)?new\s+goal\s*(of|for|to)?\s*/i, "")
    .replace(/^(please\s+)?goal\s*(of|for|to)?\s*/i, "")
    .replace(/^(please\s+)?help\s+me\s+plan\s*(for|to)?\s*/i, "")
    .replace(/^(please\s+)?plan\s+(a\s+)?goal\s*(for|to)?\s*/i, "")
    .trim();

  scenario = scenario.replace(/^(i\s+want\s+to\s+)/i, "I want to ");
  if (!scenario) {
    scenario = normalized;
  }

  const deadlinePhraseRegex = /(?:deadline\s*(?:of|is|to)?|by|until)\s+([^,.!?]+)/i;
  const deadlineMatch = scenario.match(deadlinePhraseRegex) ?? normalized.match(deadlinePhraseRegex);
  let deadlineIso: string | undefined;
  if (deadlineMatch?.[1]) {
    const parsed = parseDateToIso(deadlineMatch[1]);
    if (parsed) {
      deadlineIso = parsed;
      // Keep scenario focused on the goal statement and remove date/deadline phrase.
      scenario = scenario.replace(deadlineMatch[0], "").trim();
      scenario = scenario.replace(/[,.!?;:\-\s]+$/, "").trim();
    }
  }

  if (!scenario) {
    scenario = normalized;
  }

  return { scenario, deadline: deadlineIso };
}

export default function ChatBot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const goalDraft = extractGoalDraftFromMessage(text);
    if (goalDraft) {
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setThinking(true);
      setStreaming(true);

      const params = new URLSearchParams();
      params.set("scenario", goalDraft.scenario);
      if (goalDraft.deadline) {
        params.set("deadline", goalDraft.deadline);
      }

      window.setTimeout(() => {
        setThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "For sure, let me help you with that. Opening goal setup now.",
          },
        ]);

        window.setTimeout(() => {
          setOpen(false);
          setStreaming(false);
          router.push(`/goals/new?${params.toString()}`);
        }, GOAL_REDIRECT_DELAY_MS);
      }, GOAL_ACK_DELAY_MS);

      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setThinking(true);
    setStreaming(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "demo-user-001",
        },
        body: JSON.stringify({
          message: text,
          history: updatedMessages.slice(-20), // keep last 20 messages for context
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Something went wrong" }));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${err.detail || "Something went wrong"}` },
        ]);
        setThinking(false);
        setStreaming(false);
        return;
      }

      setThinking(false);

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let assistantContent = "";

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        const captured = assistantContent;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: captured };
          return updated;
        });
      }
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Is the backend running?" },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Floating button + tooltip */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-[100] flex items-end gap-3">
          {/* Dismissible tooltip */}
          {!tooltipDismissed && (
            <div className="relative mb-1 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-[#0a0f1f]/90 backdrop-blur-xl px-4 py-2.5 shadow-lg shadow-black/30 animate-fadeIn">
              <p className="text-xs text-cyan-100 whitespace-nowrap">Stuck? Talk with <span className="font-semibold text-cyan-300">Ryuk</span> now</p>
              <button
                onClick={(e) => { e.stopPropagation(); setTooltipDismissed(true); }}
                className="ml-1 text-slate-500 hover:text-slate-300 transition"
                aria-label="Dismiss"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              {/* Arrow pointing right */}
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-[#0a0f1f]/90 border-r border-t border-cyan-500/20" />
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            className="relative h-14 w-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center hover:scale-110 transition-transform duration-200 overflow-hidden"
            aria-label="Open Ryuk chatbot"
          >
            <Image src="/bot.avif" alt="Ryuk" width={56} height={56} className="h-full w-full object-cover opacity-60" />
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute drop-shadow-md">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-[100] w-[380px] h-[520px] flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0f1f]/95 backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0">
                <Image src="/bot.avif" alt="Ryuk" width={32} height={32} className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-semibold text-cyan-50">Ryuk</p>
                <p className="text-[10px] text-slate-500">Chat Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-300 transition p-1"
              aria-label="Close chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
            {messages.length === 0 && !thinking && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
                <div className="h-12 w-12 rounded-full overflow-hidden border border-cyan-500/20">
                  <Image src="/bot.avif" alt="Ryuk" width={48} height={48} className="h-full w-full object-cover" />
                </div>
                <p className="text-sm font-medium text-cyan-100">Hey! I&apos;m Ryuk</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ask me anything about your goals, study schedule, or topics. I only know what&apos;s in your planner.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan-500/15 text-cyan-50 border border-cyan-500/20"
                      : "bg-white/[0.04] text-slate-300 border border-white/[0.06]"
                  }`}
                >
                  {msg.content}
                  {/* Typing cursor for streaming assistant message */}
                  {streaming && msg.role === "assistant" && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400 animate-pulse rounded-full align-text-bottom" />
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-slate-500">Ryuk is thinking...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask Ryuk anything..."
                disabled={streaming}
                className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5 text-sm text-cyan-50 placeholder-slate-600 outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 transition disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
                className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white flex items-center justify-center hover:brightness-110 disabled:opacity-40 transition"
                aria-label="Send message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
