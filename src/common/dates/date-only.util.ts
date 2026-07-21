const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const RENTAL_BUSINESS_TIME_ZONE = 'America/Mexico_City';

export function parseDateOnlyToUtc(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new RangeError('La fecha debe usar el formato AAAA-MM-DD');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('La fecha no es valida');
  }

  return date;
}

export function normalizeDateOnlyUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getDateOnlyToday(
  now = new Date(),
  timeZone = RENTAL_BUSINESS_TIME_ZONE,
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return parseDateOnlyToUtc(
    `${values.get('year')}-${values.get('month')}-${values.get('day')}`,
  );
}

export function formatDateOnlyForDto(date: Date | null | undefined) {
  return date?.toISOString().slice(0, 10) ?? undefined;
}
