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
import { 
  CheckCircle2, ChevronLeft, ChevronRight, 
  Clock, AlertTriangle, XCircle, Trash2, Calendar as CalIcon
} from "lucide-react";

// Extend MicroBlock for UI to include associated goal data
interface GlobalBlock extends MicroBlock {
  goalTitle: string;
  topicTitle: string;
}

export default function AllGoalsDashboard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [blockActionId, setBlockActionId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  
  const [globalBlocks, setGlobalBlocks] = useState<GlobalBlock[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      // 1. Fetch all goals
      const allGoals = await listGoals();
      setGoals(allGoals);

      // 2. Fetch plans & knowledge for active goals concurrently
      const activeGoals = allGoals.filter(g => g.active_plan_id);
      const planPromises = activeGoals.map(g => getPlanForGoal(g.goal_id).catch(() => null));
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
        const parentGoal = activeGoals.find(g => g.goal_id === plan.goal_id);
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
  const blocksByDate = globalBlocks.reduce((acc, block) => {
    const dateStr = new Date(block.start_dt).toISOString().split('T')[0];
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(block);
    return acc;
  }, {} as Record<string, GlobalBlock[]>);

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

  if (loading && goals.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading your command center...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      
      {/* 1. MASTER CALENDAR SECTION */}
      <div className="max-w-4xl mx-auto px-6 pt-10">
        <div className="flex justify-between items-end mb-6">
          <h1 className="text-3xl italic font-serif text-slate-800 tracking-tight leading-tight">
            Master Calendar
          </h1>
          <Link
            href="/goals/new"
            className="px-5 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition flex items-center shadow-sm"
          >
            + New Goal
          </Link>
        </div>

        <div className="bg-white border text-slate-800 rounded-2xl shadow-sm overflow-hidden mb-12">
          {blockError ? (
            <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {blockError}
            </div>
          ) : null}
          {/* Date Carousel */}
          <div className="flex items-center justify-between border-b px-2 py-2 mb-4 bg-slate-50/50">
            <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition">
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
                      isSelected ? 'bg-brand-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-brand-100' : ''}`}>{dayOfWeek}</span>
                    <span className="text-lg font-bold">{dayOfMonth}</span>
                  </button>
                );
              }) : (
                <span className="text-sm text-slate-400 py-4 italic">No study dates scheduled yet.</span>
              )}
            </div>
            <button className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Global Timeline Container */}
          <div className="px-6 py-2 pb-6 space-y-6 max-h-[500px] overflow-y-auto">
            {(selectedDate && blocksByDate[selectedDate] ? blocksByDate[selectedDate] : []).map(block => {
              const isDone = block.status === "done";
              const isMissed = block.status === "missed";
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
                        {block.topicTitle}
                      </h4>
                      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                        <span className="px-1.5 py-0.5 rounded bg-black/5 uppercase font-bold tracking-wider">
                          {block.duration_min >= 60 ? `${block.duration_min/60} HRS` : `${block.duration_min} MIN`}
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
                            className="p-2 text-green-600 hover:bg-green-100 rounded-full transition disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(block.block_id, "missed")}
                            disabled={blockActionId === block.block_id}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition disabled:opacity-50"
                          >
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
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          Active Goals
          <span className="ml-3 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
            {goals.length}
          </span>
        </h2>
        
        {goals.length === 0 ? (
          <div className="text-center py-10 bg-white border rounded-2xl">
            <p className="text-slate-500 mb-4">No goals yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((goal) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              
              return (
                <div key={goal.goal_id} className="relative group p-5 border border-slate-200 rounded-2xl bg-white hover:shadow-lg hover:border-brand-200 transition-all flex flex-col justify-between">
                  <Link href={`/goals/${goal.goal_id}`} className="absolute inset-0 z-0"></Link>
                  
                  <div className="relative z-10 flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 tracking-tight group-hover:text-brand-600 transition-colors">
                        {goal.title}
                      </h3>
                      <div className="flex items-center text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider gap-2">
                        <span>{goal.category}</span>
                        <span>•</span>
                        <span className={`px-1.5 py-0.5 rounded ${goal.priority === 'High' ? 'bg-red-50 text-red-600' : goal.priority === 'Medium' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>
                          {goal.priority}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.preventDefault(); handleDeleteGoal(goal.goal_id, goal.title); }}
                      disabled={actionLoading}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-20"
                      title="Delete Goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="relative z-10 flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                    <div className="flex items-center text-sm font-medium text-slate-500">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {daysLeft} days left
                    </div>
                    <div className="flex gap-2">
                      {goal.knowledge_id && !goal.active_plan_id && (
                        <span className="px-2 py-1 bg-green-50 border border-green-200 text-green-600 rounded-md text-[10px] uppercase font-bold tracking-wider">
                          Ready to Plan
                        </span>
                      )}
                      {goal.active_plan_id && (
                        <span className="flex items-center px-2 py-1 bg-brand-50 border border-brand-200 text-brand-600 rounded-md text-[10px] uppercase font-bold tracking-wider">
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
