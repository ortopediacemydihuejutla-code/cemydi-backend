import { CouponDiscountType } from '@prisma/client';
import { validateCouponForSubtotal } from './coupon-pricing.util';

const coupon = {
  id: 1,
  code: 'SALUD20',
  description: 'Cupón de prueba',
  discountType: CouponDiscountType.PERCENT,
  discountValue: 20,
  minimumPurchase: 500,
  maximumDiscount: 300,
  usageLimit: 100,
  usedCount: 2,
  startAt: new Date('2026-07-01T00:00:00.000Z'),
  endAt: new Date('2026-08-31T23:59:59.000Z'),
  active: true,
};

describe('coupon pricing', () => {
  it('applies a percentage coupon with a maximum discount', () => {
    expect(
      validateCouponForSubtotal(
        coupon,
        2000,
        new Date('2026-07-27T12:00:00.000Z'),
      ),
    ).toEqual({
      valid: true,
      reason: null,
      discountAmount: 300,
    });
  });

  it('rejects a coupon below its minimum purchase', () => {
    const result = validateCouponForSubtotal(
      coupon,
      400,
      new Date('2026-07-27T12:00:00.000Z'),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mínima/);
  });
});
