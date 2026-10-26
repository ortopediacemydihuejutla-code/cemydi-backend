import {
  computeScheduleNextRunAt,
  normalizePositiveScheduleInteger,
  normalizeScheduleBoolean,
  normalizeScheduleTimeValue,
  toSafeScheduleNumber,
} from './index';

describe('Scheduling Utils', () => {
  describe('normalizeScheduleBoolean', () => {
    it('debe aceptar booleanos directos y strings equivalentes', () => {
      expect(normalizeScheduleBoolean(true, 'campo')).toBe(true);
      expect(normalizeScheduleBoolean('true', 'campo')).toBe(true);
      expect(normalizeScheduleBoolean('si', 'campo')).toBe(true);
      expect(normalizeScheduleBoolean('1', 'campo')).toBe(true);
      expect(normalizeScheduleBoolean(false, 'campo')).toBe(false);
      expect(normalizeScheduleBoolean('no', 'campo')).toBe(false);
    });

    it('debe lanzar error ante valores inválidos', () => {
      expect(() => normalizeScheduleBoolean('quizas', 'campo')).toThrow(
        'Valor invalido para campo',
      );
    });
  });

  describe('normalizeScheduleTimeValue', () => {
    it('debe validar formato HH:mm en 24 horas', () => {
      expect(normalizeScheduleTimeValue('03:30')).toBe('03:30');
      expect(normalizeScheduleTimeValue('23:59')).toBe('23:59');
    });

    it('debe lanzar error ante formato de hora inválido', () => {
      expect(() => normalizeScheduleTimeValue('25:00')).toThrow(
        'Invalid schedule time value',
      );
      expect(() => normalizeScheduleTimeValue('invalid')).toThrow(
        'Invalid schedule time value',
      );
    });
  });

  describe('normalizePositiveScheduleInteger & toSafeScheduleNumber', () => {
    it('debe normalizar números enteros positivos', () => {
      expect(normalizePositiveScheduleInteger(5, 'dias', 30)).toBe(5);
      expect(normalizePositiveScheduleInteger('10', 'dias', 30)).toBe(10);
    });

    it('debe convertir a número seguro con toSafeScheduleNumber', () => {
      expect(toSafeScheduleNumber(42)).toBe(42);
      expect(toSafeScheduleNumber(BigInt(100))).toBe(100);
      expect(toSafeScheduleNumber('25')).toBe(25);
      expect(toSafeScheduleNumber(undefined)).toBe(0);
    });

    it('debe lanzar error si está fuera de rango', () => {
      expect(() => normalizePositiveScheduleInteger(50, 'dias', 30)).toThrow();
    });
  });

  describe('computeScheduleNextRunAt', () => {
    it('debe calcular la siguiente ejecución basada en tiempo y días', () => {
      const now = new Date('2026-06-01T10:00:00.000Z');
      const nextRun = computeScheduleNextRunAt(now, 1, '12:00');
      expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
