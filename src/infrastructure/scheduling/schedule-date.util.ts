export function parseOptionalScheduleDate(
  value: Date | string | null | undefined,
) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toIsoScheduleDate(value: Date | string | null | undefined) {
  const parsed = parseOptionalScheduleDate(value);
  return parsed ? parsed.toISOString() : null;
}

export function buildDateAtScheduleTime(baseDate: Date, runAtTime: string) {
  const [hours, minutes] = runAtTime.split(':').map((value) => Number(value));
  const scheduledDate = new Date(baseDate);
  scheduledDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return scheduledDate;
}
