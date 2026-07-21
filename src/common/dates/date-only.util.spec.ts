import {
  formatDateOnlyForDto,
  getDateOnlyToday,
  normalizeDateOnlyUtc,
  parseDateOnlyToUtc,
} from './date-only.util';

describe('date-only utilities', () => {
  it('parses a calendar date without applying the server time zone', () => {
    expect(parseDateOnlyToUtc('2026-07-20').toISOString()).toBe(
      '2026-07-20T00:00:00.000Z',
    );
  });

  it('rejects impossible calendar dates', () => {
    expect(() => parseDateOnlyToUtc('2026-02-30')).toThrow(
      'La fecha no es valida',
    );
  });

  it('uses the Mexico City calendar day even after midnight UTC', () => {
    const now = new Date('2026-07-21T01:30:00.000Z');

    expect(getDateOnlyToday(now).toISOString()).toBe(
      '2026-07-20T00:00:00.000Z',
    );
  });

  it('normalizes and serializes stored date-only values', () => {
    const normalized = normalizeDateOnlyUtc(
      new Date('2026-07-20T18:45:00.000Z'),
    );

    expect(formatDateOnlyForDto(normalized)).toBe('2026-07-20');
  });
});
