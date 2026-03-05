const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": "demo-user-001", // MVP: hardcoded demo user
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API error");
  }
  return res.json();
}

// ─── Goals ───
export const createGoal = (body: GoalCreate) =>
  apiFetch<Goal>("/api/goals", { method: "POST", body: JSON.stringify(body) });

export const listGoals = () => apiFetch<Goal[]>("/api/goals");

export const getGoal = (id: string) => apiFetch<Goal>(`/api/goals/${id}`);

export const deleteGoal = (id: string) =>
  apiFetch(`/api/goals/${id}`, { method: "DELETE" });

// ─── Retriever ───
export const triggerIngest = (goalId: string) =>
  apiFetch(`/api/retriever/ingest?goal_id=${goalId}`, { method: "POST" });

export const getKnowledge = (goalId: string) =>
  apiFetch<GoalKnowledge>(`/api/retriever/knowledge/${goalId}`);

// ─── Plans ───
export const generatePlan = (goalId: string, window = 7) =>
  apiFetch(`/api/plans/generate?goal_id=${goalId}&window=${window}`, { method: "POST" });

export const getPlan = (planId: string) => apiFetch<Plan>(`/api/plans/${planId}`);

export const getPlanForGoal = (goalId: string) =>
  apiFetch<Plan>(`/api/plans/goal/${goalId}`);

// ─── Blocks ───
export const updateBlockStatus = (blockId: string, status: string) =>
  apiFetch(`/api/blocks/${blockId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

// ─── Sync ───
export const syncCalendar = (planId: string) =>
  apiFetch(`/api/sync/calendar/${planId}`, { method: "POST" });

// ─── Types ───
export interface GoalCreate {
  title: string;
  category: string;
  deadline: string;
  priority: string;
  target_weekly_effort?: number;
  prefer_user_materials_only?: boolean;
  material_urls?: string[];
}

export interface Goal {
  goal_id: string;
  user_id: string;
  title: string;
  category: string;
  deadline: string;
  priority: string;
  target_weekly_effort?: number;
  prefer_user_materials_only: boolean;
  material_urls: string[];
  uploaded_file_ids: string[];
  knowledge_id?: string;
  active_plan_id?: string;
}

export interface Topic {
  topic_id: string;
  title: string;
  description: string;
  est_hours: number;
  prereq_ids: string[];
}

export interface GoalKnowledge {
  knowledge_id: string;
  goal_id: string;
  topics: Topic[];
  milestones: { title: string; topic_ids: string[] }[];
  estimated_total_hours: number;
  confidence_score: number;
}

export interface MicroBlock {
  block_id: string;
  plan_id: string;
  goal_id: string;
  topic_id: string;
  start_dt: string;
  duration_min: number;
  status: string;
  external_event_id?: string;
}

export interface Plan {
  plan_id: string;
  user_id: string;
  goal_id: string;
  generated_at: string;
  plan_window_days: number;
  micro_blocks: MicroBlock[];
  explanation: string;
}
