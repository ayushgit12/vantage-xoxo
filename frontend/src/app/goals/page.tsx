"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  listGoals, 
  getPlanForGoal, 
  getKnowledge, 
  updateBlockStatus, 
  deleteGoal,
  type Goal, 
  type Plan, 
  type MicroBlock 
} from "@/lib/api";
import { computeBlockProgress, getDefaultSelectedDate, getSortedDates, groupBlocksByDate, parseDateKey } from "@/lib/schedule";
import { 
  CheckCircle2, ChevronLeft, ChevronRight, 
  Clock, AlertTriangle, XCircle, Trash2, Calendar as CalIcon
} from "lucide-react";

// Extend MicroBlock for UI to include associated goal data
interface GlobalBlock extends MicroBlock {
  goalTitle: string;
  topicTitle: string;
}

function formatDurationBadge(durationMin: number): string {
  if (durationMin < 60) {
    return `${durationMin} MIN`;
  }

  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;

  if (minutes === 0) {
    return `${hours} HR`;
  }

  return `${hours} HR ${minutes} MIN`;
}

export default function AllGoalsDashboard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockActionId, setBlockActionId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  
  const [globalBlocks, setGlobalBlocks] = useState<GlobalBlock[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const visibleGoals = goals.filter((goal) => goal.status !== "completed" && goal.status !== "archived");

  function getGoalProgress(goalId: string) {
    const goalBlocks = globalBlocks.filter((block) => block.goal_id === goalId);
    if (goalBlocks.length === 0) {
      return 0;
    }
    // Effort-weighted: a 2-hour block counts more than a 30-min block.
    return computeBlockProgress(goalBlocks).progressPct;
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      // 1. Fetch all goals
      const allGoals = await listGoals();
      setGoals(allGoals);

      // 2. Fetch plans & knowledge for active goals concurrently
      const scheduledGoals = allGoals.filter((goal) => goal.status === "active" && goal.active_plan_id);
      const planPromises = scheduledGoals.map(g => getPlanForGoal(g.goal_id).catch(() => null));
      const knowledgePromises = allGoals.filter(g => g.knowledge_id).map(g => getKnowledge(g.goal_id).catch(() => null));

      const plansResp = await Promise.all(planPromises);
      const knowledgeResp = await Promise.all(knowledgePromises);

      const validPlans = plansResp.filter((p): p is Plan => p !== null);
      
      // Build a map of topic_id -> topic.title
      const topicMap: Record<string, string> = {};
      knowledgeResp.forEach(k => {
        if (k) {
          k.topics.forEach(t => {
            topicMap[t.topic_id] = t.title;
          });
        }
      });

      // 3. Merge all microblocks globally
      let mergedBlocks: GlobalBlock[] = [];
      validPlans.forEach(plan => {
        const parentGoal = scheduledGoals.find(g => g.goal_id === plan.goal_id);
        const goalTitle = parentGoal?.title || "Unknown Goal";

        const mappedBlocks = plan.micro_blocks.map(b => ({
          ...b,
          goalTitle,
          topicTitle: topicMap[b.topic_id] || `Topic ${b.topic_id.substring(0,8)}`
        }));
        mergedBlocks = mergedBlocks.concat(mappedBlocks);
      });

      // Sort chronological
      mergedBlocks.sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime());
      setGlobalBlocks(mergedBlocks);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Handle Block Status changes directly from master calendar
  async function handleStatusChange(blockId: string, status: string) {
    setBlockError(null);
    setBlockActionId(blockId);
    const previousBlocks = globalBlocks;
    try {
      setGlobalBlocks(prev => prev.map(b => b.block_id === blockId ? { ...b, status } : b));
      await updateBlockStatus(blockId, status);
      if (status === "missed" || status === "partial") {
        await loadData();
      }
    } catch (e) {
      console.error(e);
      setGlobalBlocks(previousBlocks);
      setBlockError(e instanceof Error ? e.message : "Failed to update block status.");
      await loadData(); // rollback to server truth on failure
    } finally {
      setBlockActionId(null);
    }
  }

  // Handle Goal Deletion
  async function handleDeleteGoal(goalId: string, title: string) {
    if (!window.confirm(`Are you sure you want to delete the goal "${title}"? This cannot be undone.`)) {
      return;
    }
    setActionLoading(true);
    try {
      await deleteGoal(goalId);
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to delete goal.");
    } finally {
      setActionLoading(false);
    }
  }

  // Group fetched global blocks by date string
  const blocksByDate = groupBlocksByDate(globalBlocks);
  const availableDates = getSortedDates(blocksByDate);

  // Set default selected date if none chosen
  useEffect(() => {
    setSelectedDate((current) => {
      if (current && availableDates.includes(current)) {
        return current;
      }
      return getDefaultSelectedDate(availableDates);
    });
  }, [availableDates, selectedDate]);

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatDateHeader(dateStr: string) {
    const d = parseDateKey(dateStr);
    return {
      dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dayOfMonth: d.getDate()
    };
  }

  if (loading && goals.length === 0) {
    return <div className="p-8 text-center text-slate-500">Loading your command center...</div>;
  }

  return (
    <div className="min-h-screen pb-20">
      
      {/* 1. MASTER CALENDAR SECTION */}
      <div className="max-w-4xl mx-auto px-6 pt-10">
        <div className="flex justify-between items-end mb-6">
          <h1 className="text-3xl italic font-serif text-cyan-50 tracking-tight leading-tight">
            Master Calendar
          </h1>
          <Link
            href="/goals/new"
            className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition flex items-center shadow-sm shadow-cyan-500/20"
          >
            + New Goal
          </Link>
        </div>

        <div className="glass-card text-cyan-50 overflow-hidden mb-12">
          {blockError ? (
            <div className="mx-4 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {blockError}
            </div>
          ) : null}
          {/* Date Carousel */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-2 py-2 mb-4">
            <button className="p-3 text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04] rounded-full transition">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-1 justify-center gap-2 overflow-x-auto no-scrollbar">
              {availableDates.length > 0 ? availableDates.map(dateStr => {
                const { dayOfWeek, dayOfMonth } = formatDateHeader(dateStr);
                const isSelected = selectedDate === dateStr;
                return (
                  <button 
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center justify-center w-14 h-16 rounded-xl transition-all ${
                      isSelected ? 'bg-cyan-500/20 text-cyan-300 shadow-md shadow-cyan-500/10 border border-cyan-500/30' : 'text-slate-500 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-cyan-400' : ''}`}>{dayOfWeek}</span>
                    <span className="text-lg font-bold">{dayOfMonth}</span>
                  </button>
                );
              }) : (
                <span className="text-sm text-slate-600 py-4 italic">No study dates scheduled yet.</span>
              )}
            </div>
            <button className="p-3 text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04] rounded-full transition">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Global Timeline Container */}
          <div className="px-6 py-2 pb-6 space-y-6 max-h-[500px] overflow-y-auto">
            {(selectedDate && blocksByDate[selectedDate] ? blocksByDate[selectedDate] : []).map(block => {
              const isDone = block.status === "done";
              const isPartial = block.status === "partial";
              const isMissed = block.status === "missed";
              const isActive = block.status === "scheduled" && new Date(block.start_dt).getTime() < Date.now() + 3600000;
              
              let cardStyle = "block-upcoming";
              if (isDone) cardStyle = "block-done";
              else if (isPartial) cardStyle = "block-partial";
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
                        {block.topicTitle}
                      </h4>
                      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] uppercase font-bold tracking-wider">
                          {formatDurationBadge(block.duration_min)}
                        </span>
                        <span className="opacity-70 flex items-center">
                          <span className="mx-1">•</span>
                          {block.goalTitle}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Status Icons */}
                    <div className="flex gap-2 shrink-0 ml-4">
                      {block.status === "scheduled" && (
                        <>
                          <button
                            onClick={() => handleStatusChange(block.block_id, "done")}
                            disabled={blockActionId === block.block_id}
                            className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-full transition disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(block.block_id, "partial")}
                            disabled={blockActionId === block.block_id}
                            className="p-2 text-amber-400 hover:bg-amber-500/10 rounded-full transition disabled:opacity-50"
                          >
                            <Clock className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(block.block_id, "missed")}
                            disabled={blockActionId === block.block_id}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-full transition disabled:opacity-50"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      {isDone && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                      {isPartial && (
                        <div className="flex flex-col items-center">
                          <Clock className="w-5 h-5 text-amber-400 mb-0.5" />
                          <span className="text-[9px] font-bold text-amber-400 tracking-wider">PARTIAL</span>
                        </div>
                      )}
                      {isMissed && (
                        <div className="flex flex-col items-center">
                          <AlertTriangle className="w-5 h-5 text-red-400 mb-0.5" />
                          <span className="text-[9px] font-bold text-red-400 tracking-wider">MISSED</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {globalBlocks.length > 0 && (!selectedDate || !blocksByDate[selectedDate]?.length) && (
              <div className="text-center py-12 text-slate-400 text-sm">
                No blocks scheduled for this date. Take a break!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. GOALS GRID SECTION */}
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-xl font-bold text-cyan-50 mb-6 flex items-center">
          Active Goals
          <span className="ml-3 px-2 py-0.5 rounded-full bg-white/[0.06] text-cyan-300 text-xs font-bold">
            {visibleGoals.length}
          </span>
        </h2>
        
        {visibleGoals.length === 0 ? (
          <div className="text-center py-10 glass-card">
            <p className="text-slate-500 mb-4">No goals yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleGoals.map((goal) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              const progress = getGoalProgress(goal.goal_id);
              
              return (
                <div key={goal.goal_id} className="relative group p-5 glass-card hover:shadow-lg hover:shadow-cyan-500/5 hover:border-cyan-500/20 transition-all flex flex-col justify-between">
                  <Link href={`/goals/${goal.goal_id}`} className="absolute inset-0 z-0"></Link>
                  
                  <div className="relative z-10 flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-cyan-50 tracking-tight group-hover:text-cyan-300 transition-colors">
                        {goal.title}
                      </h3>
                      <div className="flex items-center text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider gap-2">
                        <span>{goal.category}</span>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded ${goal.priority === 'high' ? 'bg-red-500/10 text-red-400' : goal.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {goal.priority}
                        </span>
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-slate-400">{goal.status}</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.preventDefault(); handleDeleteGoal(goal.goal_id, goal.title); }}
                      disabled={actionLoading}
                      className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors z-20"
                      title="Delete Goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="relative z-10 flex items-center justify-between mt-auto pt-4 border-t border-white/[0.06]">
                    <div className="space-y-1">
                      <div className="flex items-center text-sm font-medium text-slate-400">
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        {daysLeft} days left
                      </div>
                      {goal.active_plan_id ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[11px] font-semibold text-cyan-400">{progress}%</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {goal.knowledge_id && !goal.active_plan_id && (
                        <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[10px] uppercase font-bold tracking-wider">
                          Ready to Plan
                        </span>
                      )}
                      {goal.active_plan_id && (
                        <span className="flex items-center px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-md text-[10px] uppercase font-bold tracking-wider">
                          <CalIcon className="w-3 h-3 mr-1" />
                          On Track
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
