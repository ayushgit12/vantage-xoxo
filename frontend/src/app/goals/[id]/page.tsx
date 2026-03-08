"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getGoal,
  getKnowledge,
  getPlanForGoal,
  updateBlockStatus,
  syncCalendar,
  triggerIngest,
  generatePlan,
  type Goal,
  type GoalKnowledge,
  type Plan,
  type MicroBlock,
} from "@/lib/api";
import { 
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, 
  Clock, FileText, PlayCircle, Video, AlertTriangle, XCircle 
} from "lucide-react";

export default function UnifiedGoalDashboard() {
  const params = useParams();
  const goalId = params.id as string;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [knowledge, setKnowledge] = useState<GoalKnowledge | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isHabitGoal = goal?.goal_type === "habit";

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
      
      if (g.active_plan_id) {
        const p = await getPlanForGoal(goalId);
        setPlan(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Calculate generic derived states
  const daysLeft = goal ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  
  // Group plan blocks by date
  const blocksByDate = plan?.micro_blocks.reduce((acc, block) => {
    // using local date string for simplicity
    const dateStr = new Date(block.start_dt).toISOString().split('T')[0];
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(block);
    return acc;
  }, {} as Record<string, MicroBlock[]>) || {};

  const availableDates = Object.keys(blocksByDate).sort();
  
  // Set default selected date if none chosen
  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      if (availableDates.includes(today)) {
        setSelectedDate(today);
      } else {
        setSelectedDate(availableDates[0]);
      }
    }
  }, [availableDates, selectedDate]);

  // Check for drift (any missed blocks)
  const hasDrift = plan?.micro_blocks.some(b => b.status === "missed");

  async function handleReplan() {
    setActionLoading("replan");
    try {
      // Re-generate plan
      await fetch(`/api/plans/replan-all?window=7`, { method: "POST", headers: { "X-User-Id": "demo-user-001" } });
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading("");
    }
  }

  async function handleStatusChange(blockId: string, status: string) {
    try {
      await updateBlockStatus(blockId, status);
      const updated = await getPlanForGoal(goalId);
      setPlan(updated);
    } catch (e) {
      console.error(e);
    }
  }

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatDateHeader(dateStr: string) {
    const d = new Date(dateStr);
    return {
      dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dayOfMonth: d.getDate()
    };
  }

  function formatScheduleSummary() {
    if (!goal?.preferred_schedule) {
      return "Daily at 07:00 for 30 min";
    }

    const schedule = goal.preferred_schedule;
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = schedule.days.length === 7
      ? "Every day"
      : schedule.days.map((d) => dayNames[d] || d).join(", ");

    const start = `${String(schedule.start_hour).padStart(2, "0")}:00`;
    const duration = schedule.duration_min || ((schedule.end_hour - schedule.start_hour) * 60) || 30;

    return `${days} at ${start} for ${duration} min`;
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (!goal) return <div className="p-8 text-center text-red-500">Goal not found</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Top Banner for Drift */}
      {hasDrift && (
        <div className="bg-[#fff8e6] border-b border-[#fce4a6] px-6 py-3 flex justify-between items-center text-sm">
          <div className="flex items-center text-[#9c5f14] font-medium">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Schedule drift detected. Replan recommended to stay on track.
          </div>
          <button 
            onClick={handleReplan}
            disabled={!!actionLoading}
            className="px-4 py-1.5 bg-[#fce4a6] text-[#9c5f14] rounded-md font-bold text-xs hover:bg-[#fae096] transition"
          >
            {actionLoading === "replan" ? "REPLANNING..." : "REPLAN NOW"}
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl italic font-serif text-slate-800 tracking-tight leading-tight mb-2">
            {goal.title}
          </h1>
          <div className="flex items-center text-slate-500 text-sm font-medium tracking-wider">
            <Clock className="w-4 h-4 mr-1.5" />
            {daysLeft} DAYS LEFT
          </div>
        </div>
        
        {/* Actions - typically in a navbar, but placed here for MVP */}
        <div className="flex gap-3">
          <button className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">
            Edit Goal
          </button>
          {isHabitGoal ? (
            !plan ? (
              <button 
                onClick={async () => { setActionLoading("plan"); await generatePlan(goalId); await loadData(); setActionLoading(""); }}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
              >
                Generate Routine
              </button>
            ) : (
              <button 
                onClick={async () => { setActionLoading("sync"); await syncCalendar(plan.plan_id); setActionLoading(""); }}
                disabled={!!actionLoading}
                className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Sync to Calendar
              </button>
            )
          ) : !knowledge ? (
            <button 
              onClick={async () => { setActionLoading("ingest"); await triggerIngest(goalId); await loadData(); setActionLoading(""); }}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              Parse Materials
            </button>
          ) : !plan ? (
            <button 
              onClick={async () => { setActionLoading("plan"); await generatePlan(goalId); await loadData(); setActionLoading(""); }}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              Generate Plan
            </button>
          ) : (
            <button 
              onClick={async () => { setActionLoading("sync"); await syncCalendar(plan.plan_id); setActionLoading(""); }}
              disabled={!!actionLoading}
              className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Sync to Calendar
            </button>
          )}
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-10 mt-6">
        
        {/* Left Sidebar: Retriever & Sources */}
        <div className="md:col-span-3 space-y-10">
          {isHabitGoal ? (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-4">Routine</h3>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Schedule</p>
                  <p className="text-sm text-slate-700">{formatScheduleSummary()}</p>
                </div>
                {goal.target_weekly_effort ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Weekly Effort</p>
                    <p className="text-sm text-slate-700">{goal.target_weekly_effort} hrs / week</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tracking</p>
                  <p className="text-sm text-slate-700">This habit skips material parsing and goes straight to routine scheduling.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Topics List */}
              {knowledge && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-4">Retriever</h3>
                  <ul className="space-y-4">
                    {knowledge.topics.map(t => (
                      <li key={t.topic_id} className="flex justify-between items-center border-b border-slate-200 border-dotted pb-2">
                        <span className="text-sm font-medium text-slate-700 truncate pr-4" title={t.title}>{t.title}</span>
                        <span className="text-xs text-slate-400 font-mono">{t.est_hours}h</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Sources */}
          {!isHabitGoal && (goal.uploaded_file_ids.length > 0 || goal.material_urls.length > 0) ? (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-4">Sources</h3>
              <div className="space-y-3">
                {goal.uploaded_file_ids.map((file, i) => (
                  <div key={i} className="flex items-center p-3 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <div className="w-8 h-8 rounded bg-red-50 text-red-500 flex items-center justify-center mr-3 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-slate-700 truncate">{file.split('/').pop()}</p>
                      <p className="text-[10px] text-slate-400">Uploaded PDF</p>
                    </div>
                  </div>
                ))}
                {goal.material_urls.map((url, i) => {
                  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
                  return (
                    <div key={i} className="flex items-center p-3 border border-slate-200 rounded-xl bg-white shadow-sm">
                      <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 shrink-0 ${isYoutube ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'}`}>
                        {isYoutube ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-slate-700 truncate">{new URL(url).hostname}</p>
                        <p className="text-[10px] text-slate-400 truncate">{url}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Main Area: Timeline */}
        <div className="md:col-span-9">
          
          {plan ? (
            <div className="bg-white border text-slate-800 rounded-2xl shadow-sm overflow-hidden">
              {/* Date Carousel */}
              <div className="flex items-center justify-between border-b px-2 py-2 mb-6">
                <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex flex-1 justify-center gap-2 overflow-x-auto no-scrollbar">
                  {availableDates.map(dateStr => {
                    const { dayOfWeek, dayOfMonth } = formatDateHeader(dateStr);
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button 
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`flex flex-col items-center justify-center w-14 h-16 rounded-xl transition-all ${
                          isSelected ? 'bg-brand-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`text-[10px] font-bold ${isSelected ? 'text-brand-100' : ''}`}>{dayOfWeek}</span>
                        <span className="text-lg font-bold">{dayOfMonth}</span>
                      </button>
                    );
                  })}
                </div>
                <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Timeline Container */}
              <div className="px-6 py-4 space-y-6 max-h-[500px] overflow-y-auto">
                {(selectedDate && blocksByDate[selectedDate] ? blocksByDate[selectedDate] : []).map(block => {
                  const topic = knowledge?.topics.find(t => t.topic_id === block.topic_id);
                  const isDone = block.status === "done";
                  const isMissed = block.status === "missed";
                  // Assuming the next 'scheduled' block is active
                  const isActive = block.status === "scheduled" && new Date(block.start_dt).getTime() < Date.now() + 3600000;
                  
                  let cardStyle = "block-upcoming";
                  if (isDone) cardStyle = "block-done";
                  else if (isMissed) cardStyle = "block-missed";
                  else if (isActive) cardStyle = "block-active";

                  return (
                    <div key={block.block_id} className="relative flex items-start gap-4">
                      {/* Left Time label */}
                      <div className="w-12 pt-4 text-xs font-mono font-medium text-slate-400 text-right shrink-0">
                        {formatTime(block.start_dt)}
                      </div>
                      
                      {/* Block Card */}
                      <div className={`flex-1 rounded-xl p-4 flex justify-between items-center transition-all ${cardStyle}`}>
                        <div>
                          <h4 className={`font-semibold text-sm mb-1 ${isDone ? 'line-through opacity-70' : ''}`}>
                            {topic?.title || `Topic ${block.topic_id.substring(0,8)}`}
                          </h4>
                          <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                            <span className="px-1.5 py-0.5 rounded bg-black/5 uppercase font-bold tracking-wider">
                              {block.duration_min >= 60 ? `${block.duration_min/60} HRS` : `${block.duration_min} MIN`}
                            </span>
                            {topic?.title && <span className="opacity-70">— {goal?.category || "Study"}</span>}
                          </div>
                        </div>

                        {/* Interactive Status Icons */}
                        <div className="flex gap-2 shrink-0">
                          {block.status === "scheduled" && (
                            <>
                              <button onClick={() => handleStatusChange(block.block_id, "done")} className="p-2 text-green-600 hover:bg-green-100 rounded-full transition">
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button onClick={() => handleStatusChange(block.block_id, "missed")} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition">
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          )}
                          {isDone && <CheckCircle2 className="w-6 h-6 text-green-600" />}
                          {isMissed && (
                            <div className="flex flex-col items-center">
                              <AlertTriangle className="w-5 h-5 text-red-500 mb-0.5" />
                              <span className="text-[9px] font-bold text-red-500 tracking-wider">MISSED</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!selectedDate || !blocksByDate[selectedDate]?.length) && (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No blocks scheduled for this date.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
              {isHabitGoal ? "Generate a routine to see your schedule" : "Generate a plan to see your timeline"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
