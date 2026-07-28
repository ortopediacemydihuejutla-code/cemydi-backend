import {
  calculateDiscountedPrice,
  getBestActivePromotion,
} from './promotion-pricing.util';

describe('promotion pricing', () => {
  it('calculates a monetary price rounded to cents', () => {
    expect(calculateDiscountedPrice(999.99, 15)).toBe(849.99);
  });

  it('chooses the highest active discount', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    const promotion = getBestActivePromotion(
      [
        {
          id: 1,
          discountPercent: 10,
          startAt: new Date('2026-07-20T00:00:00.000Z'),
          endAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 2,
          discountPercent: 25,
          startAt: new Date('2026-07-26T00:00:00.000Z'),
          endAt: new Date('2026-07-30T00:00:00.000Z'),
        },
        {
          id: 3,
          discountPercent: 50,
          startAt: new Date('2026-08-02T00:00:00.000Z'),
          endAt: new Date('2026-08-03T00:00:00.000Z'),
        },
      ],
      now,
    );

    expect(promotion?.id).toBe(2);
  });
});
