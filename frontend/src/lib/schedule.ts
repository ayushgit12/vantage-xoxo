export interface SchedulableBlock {
  start_dt: string;
}

export function getLocalDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(): string {
  return getLocalDateKey(new Date());
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function groupBlocksByDate<T extends SchedulableBlock>(blocks: T[]): Record<string, T[]> {
  return blocks.reduce<Record<string, T[]>>((accumulator, block) => {
    const dateKey = getLocalDateKey(block.start_dt);
    if (!accumulator[dateKey]) {
      accumulator[dateKey] = [];
    }
    accumulator[dateKey].push(block);
    return accumulator;
  }, {});
}

export function getSortedDates(blocksByDate: Record<string, unknown>): string[] {
  return Object.keys(blocksByDate).sort();
}

export function getDefaultSelectedDate(availableDates: string[]): string | null {
  if (availableDates.length === 0) {
    return null;
  }

  const today = getTodayDateKey();
  return availableDates.includes(today) ? today : availableDates[0];
}

export function toDeadlineIso(dateInput: string): string {
  return `${dateInput}T23:59:59Z`;
}

// ─── Progress computation ───────────────────────────────────────────────────
// "Block count" progress is wrong: a 2-hour block should count more than a
// 30-minute block.  Use effort-weighted (duration_min) instead.
// Partial blocks count as half credit so the bar never jumps backwards.

export interface BlockProgress {
  doneMinutes: number;
  partialMinutes: number;
  totalMinutes: number;
  /** 0-100, effort-weighted, partial = half credit */
  progressPct: number;
}

export function computeBlockProgress(
  blocks: Array<{ status: string; duration_min: number }>,
  totalEstimatedMinutes?: number,
): BlockProgress {
  let doneMinutes = 0;
  let partialMinutes = 0;
  let windowMinutes = 0;

  for (const block of blocks) {
    windowMinutes += block.duration_min;
    if (block.status === "done") {
      doneMinutes += block.duration_min;
    } else if (block.status === "partial") {
      partialMinutes += block.duration_min;
    }
  }

  // Use the full goal estimate when available so progress is never capped at
  // the current 7-day window.  Fall back to window sum only when there is no
  // backend total (e.g. old plans before total_estimated_hours was added).
  const totalMinutes =
    totalEstimatedMinutes && totalEstimatedMinutes > 0
      ? totalEstimatedMinutes
      : windowMinutes;

  const effectiveDone = doneMinutes + partialMinutes * 0.5;
  const progressPct =
    totalMinutes > 0 ? Math.min(100, Math.round((effectiveDone / totalMinutes) * 100)) : 0;

  return { doneMinutes, partialMinutes, totalMinutes, progressPct };
}

// A topic is "done" when every one of its scheduled blocks is done.
// A topic is "partial" when at least one block is done or partial but not all.
export interface TopicProgress {
  completedTopicIds: Set<string>;
  partialTopicIds: Set<string>;
}

export function computeTopicProgress(
  blocks: Array<{ topic_id: string; status: string }>,
  topicIds: string[],
): TopicProgress {
  const completedTopicIds = new Set<string>();
  const partialTopicIds = new Set<string>();

  for (const topicId of topicIds) {
    const topicBlocks = blocks.filter((b) => b.topic_id === topicId);
    if (topicBlocks.length === 0) {
      continue;
    }
    const doneCount = topicBlocks.filter((b) => b.status === "done").length;
    const hasAnyProgress =
      doneCount > 0 || topicBlocks.some((b) => b.status === "partial");

    if (doneCount === topicBlocks.length) {
      completedTopicIds.add(topicId);
    } else if (hasAnyProgress) {
      partialTopicIds.add(topicId);
    }
  }

  return { completedTopicIds, partialTopicIds };
}
