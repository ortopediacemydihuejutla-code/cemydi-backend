const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeScheduleTimeValue(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Invalid schedule time value');
  }

  const normalized = value.trim();

  if (!SCHEDULE_TIME_PATTERN.test(normalized)) {
    throw new Error('Invalid schedule time value');
  }

  return normalized;
}
