export function normalizeScheduleBoolean(value: unknown, fieldLabel: string) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'si', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  throw new Error(`Valor invalido para ${fieldLabel}`);
}
