import { buildDateAtScheduleTime } from './schedule-date.util';

export function computeScheduleNextRunAt(
  now: Date,
  everyDays: number,
  runAtTime: string,
  lastRunAt?: Date | null,
) {
  if (lastRunAt) {
    const nextRunAt = buildDateAtScheduleTime(lastRunAt, runAtTime);
    nextRunAt.setDate(nextRunAt.getDate() + everyDays);

    while (nextRunAt.getTime() <= now.getTime()) {
      nextRunAt.setDate(nextRunAt.getDate() + everyDays);
    }

    return nextRunAt;
  }

  const nextRunAt = buildDateAtScheduleTime(now, runAtTime);
  if (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt.setDate(nextRunAt.getDate() + everyDays);
  }

  return nextRunAt;
}
