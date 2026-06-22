export function toSafeScheduleNumber(
  value: bigint | number | string | undefined,
) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function normalizePositiveScheduleInteger(
  value: unknown,
  fieldLabel: string,
  maxValue: number,
) {
  const rawValue =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
        ? value
        : NaN;
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
    throw new Error(
      `Valor invalido para ${fieldLabel}. Debe ser un entero entre 1 y ${maxValue}`,
    );
  }

  return parsed;
}
