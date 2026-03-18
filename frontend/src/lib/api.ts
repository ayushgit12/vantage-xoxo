import { BACKEND_URL } from "./env";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("X-User-Id", "demo-user-001");
  if (!(options?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API error");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// ─── Goals ───
export const createGoal = (body: GoalCreate) =>
  apiFetch<Goal>("/api/goals", { method: "POST", body: JSON.stringify(body) });

export const previewGoalFromScenario = (body: ScenarioGoalRequest) =>
  apiFetch<ScenarioGoalPreview>("/api/goals/intake", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const createGoalFromScenario = (body: ScenarioGoalRequest) =>
  apiFetch<Goal>("/api/goals/from-scenario", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listGoals = () => apiFetch<Goal[]>("/api/goals");

export const getGoal = (id: string) => apiFetch<Goal>(`/api/goals/${id}`);

export const updateGoal = (id: string, body: GoalUpdate) =>
  apiFetch<Goal>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteGoal = (id: string) =>
  apiFetch(`/api/goals/${id}`, { method: "DELETE" });

// ─── Retriever ───
export const triggerIngest = (goalId: string) =>
  apiFetch(`/api/retriever/ingest?goal_id=${goalId}`, { method: "POST" });

export async function triggerIngestStream(
  goalId: string,
  onProgress: (step: number, label: string, total: number) => void,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/api/retriever/ingest-stream?goal_id=${goalId}`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) throw new Error(`Ingest stream failed: ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const dataLine = line.replace(/^data: /, "");
      if (!dataLine) continue;
      const msg = JSON.parse(dataLine);
      if (msg.error) throw new Error(msg.error);
      onProgress(msg.step, msg.label, msg.total);
    }
  }
}

export const getKnowledge = (goalId: string) =>
  apiFetch<GoalKnowledge>(`/api/retriever/knowledge/${goalId}`);

export const addKnowledgeTopic = (goalId: string, body: TopicCreateRequest) =>
  apiFetch<GoalKnowledge>(`/api/retriever/knowledge/${goalId}/topics`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateKnowledgeTopic = (
  goalId: string,
  topicId: string,
  body: TopicUpdateRequest,
) =>
  apiFetch<GoalKnowledge>(`/api/retriever/knowledge/${goalId}/topics/${topicId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteKnowledgeTopic = (goalId: string, topicId: string) =>
  apiFetch<GoalKnowledge>(`/api/retriever/knowledge/${goalId}/topics/${topicId}`, {
    method: "DELETE",
  });

// ─── Plans ───
export const generatePlan = (goalId: string, window = 7) =>
  apiFetch(`/api/plans/generate?goal_id=${goalId}&window=${window}`, { method: "POST" });

export const getPlan = (planId: string) => apiFetch<Plan>(`/api/plans/${planId}`);

export const getPlanForGoal = (goalId: string) =>
  apiFetch<Plan>(`/api/plans/goal/${goalId}`);

export const replanAllPlans = (window = 7) =>
  apiFetch(`/api/plans/replan-all?window=${window}`, { method: "POST" });

// ─── Blocks ───
export const updateBlockStatus = (blockId: string, status: string) =>
  apiFetch(`/api/blocks/${blockId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

// ─── Sync ───
export const syncCalendar = (planId: string) =>
  apiFetch(`/api/sync/calendar/${planId}`, { method: "POST" });

// ─── Users ───
export const getUserProfile = () => apiFetch<UserProfile>("/api/users/profile");

export const updateUserProfile = (body: UserProfileUpdate) =>
  apiFetch<UserProfile>("/api/users/profile", { method: "PUT", body: JSON.stringify(body) });

// ─── Constraints ───
export const listConstraints = () => apiFetch<TimeConstraint[]>("/api/constraints");

export const createConstraint = (body: ConstraintCreateRequest) =>
  apiFetch<TimeConstraint>("/api/constraints", { method: "POST", body: JSON.stringify(body) });

export const updateConstraint = (constraintId: string, body: ConstraintUpdateRequest) =>
  apiFetch<TimeConstraint>(`/api/constraints/${constraintId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteConstraint = (constraintId: string) =>
  apiFetch(`/api/constraints/${constraintId}`, { method: "DELETE" });

// ─── Types ───
export interface GoalCreate {
  title: string;
  description?: string;
  goal_type?: GoalType;
  category: string;
  deadline: string;
  priority: GoalPriority;
  status?: GoalStatus;
  target_weekly_effort?: number;
  preferred_schedule?: TimeWindow | null;
  restricted_slots?: TimeWindow[];
  prefer_user_materials_only?: boolean;
  material_urls?: string[];
}

export interface GoalUpdate {
  title?: string;
  description?: string;
  goal_type?: GoalType;
  category?: string;
  deadline?: string;
  priority?: GoalPriority;
  status?: GoalStatus;
  target_weekly_effort?: number | null;
  preferred_schedule?: TimeWindow | null;
  restricted_slots?: TimeWindow[] | null;
  prefer_user_materials_only?: boolean;
  material_urls?: string[];
  completed_at?: string | null;
}

export interface Goal {
  goal_id: string;
  user_id: string;
  title: string;
  description?: string;
  goal_type?: GoalType;
  category: string;
  deadline: string;
  priority: GoalPriority;
  status: GoalStatus;
  target_weekly_effort?: number;
  preferred_schedule?: TimeWindow | null;
  restricted_slots?: TimeWindow[];
  prefer_user_materials_only: boolean;
  material_urls: string[];
  uploaded_file_ids: string[];
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  knowledge_id?: string;
  active_plan_id?: string;
}

export interface Topic {
  topic_id: string;
  title: string;
  description: string;
  est_hours: number;
  prereq_ids: string[];
  resource_refs?: string[];
  source?: string;
  locked_fields?: string[];
}

export interface TopicCreateRequest {
  title: string;
  description?: string;
  est_hours: number;
  prereq_ids?: string[];
  resource_refs?: string[];
}

export interface TopicUpdateRequest {
  title?: string;
  description?: string;
  est_hours?: number;
  prereq_ids?: string[];
  resource_refs?: string[];
}

export interface ResourceRef {
  ref_id: string;
  title: string;
  url: string;
  source_type: string;
  description: string;
  transcript: string;
}

export interface GoalKnowledge {
  knowledge_id: string;
  goal_id: string;
  topics: Topic[];
  milestones: { title: string; topic_ids: string[] }[];
  estimated_total_hours: number;
  confidence_score: number;
  resource_refs: ResourceRef[];
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
  // Snapshotted from GoalKnowledge at plan-creation time.
  // Use this as the progress denominator so progress reflects the full goal,
  // not just the current 7-day window.
  total_estimated_hours: number;
}

export interface TimeWindow {
  start_hour: number;
  end_hour: number;
  days: number[];
  duration_min?: number | null;
}

export interface UserProfile {
  user_id: string;
  display_name: string;
  email: string;
  timezone: string;
  daily_capacity_hours: number;
  max_topics_per_day: number;
  preferred_time_windows: TimeWindow[];
  sleep_window?: TimeWindow | null;
  calendar_id?: string | null;
}

export interface UserProfileUpdate {
  display_name?: string;
  email?: string;
  timezone: string;
  daily_capacity_hours: number;
  max_topics_per_day: number;
  preferred_time_windows: TimeWindow[];
  sleep_window?: TimeWindow | null;
  calendar_id?: string | null;
}

export interface TimeConstraint {
  constraint_id: string;
  user_id: string;
  type: ConstraintType;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  recurrence_rule?: string | null;
  recurring_start?: string | null;
  recurring_end?: string | null;
  recurring_days: number[];
  created_at: string;
}

export interface ConstraintCreateRequest {
  type: ConstraintType;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  recurrence_rule?: string | null;
  recurring_start?: string | null;
  recurring_end?: string | null;
  recurring_days?: number[];
}

export interface ConstraintUpdateRequest {
  title?: string;
  start_time?: string | null;
  end_time?: string | null;
  recurrence_rule?: string | null;
  recurring_start?: string | null;
  recurring_end?: string | null;
  recurring_days?: number[];
}

export type GoalType = "habit" | "learning" | "project";
export type GoalPriority = "high" | "medium" | "low";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type ConstraintType = "fixed" | "recurring" | "soft";

export interface ScenarioGoalRequest {
  scenario_text: string;
  overrides?: {
    title?: string;
    description?: string;
    category?: string;
    priority?: GoalPriority;
    deadline?: string;
    target_weekly_effort?: number;
    prefer_user_materials_only?: boolean;
    material_urls?: string[];
    preferred_schedule?: TimeWindow;
    restricted_slots?: TimeWindow[];
  };
}

export interface ScenarioGoalPreview {
  scenario_text: string;
  inferred_goal_type: GoalType;
  confidence: number;
  assumptions: string[];
  warnings: string[];
  goal_preview: GoalCreate;
}
