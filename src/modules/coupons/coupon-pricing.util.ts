import { CouponDiscountType } from '@prisma/client';

export type CouponPricingCandidate = {
  id: number;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumPurchase: number;
  maximumDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  startAt: Date;
  endAt: Date;
  active: boolean;
};

export type CouponValidation = {
  valid: boolean;
  reason: string | null;
  discountAmount: number;
};

export function validateCouponForSubtotal(
  coupon: CouponPricingCandidate,
  eligibleSubtotal: number,
  now = new Date(),
): CouponValidation {
  if (!coupon.active) {
    return invalidCoupon('Este cupón está desactivado');
  }
  if (now < coupon.startAt) {
    return invalidCoupon('Este cupón todavía no está vigente');
  }
  if (now > coupon.endAt) {
    return invalidCoupon('Este cupón ya venció');
  }
  if (
    coupon.usageLimit !== null &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    return invalidCoupon('Este cupón alcanzó su límite de usos');
  }
  if (eligibleSubtotal <= 0) {
    return invalidCoupon('Agrega productos de compra para usar el cupón');
  }
  if (eligibleSubtotal < coupon.minimumPurchase) {
    return invalidCoupon(
      `Compra mínima requerida: $${coupon.minimumPurchase.toFixed(2)}`,
    );
  }

  const rawDiscount =
    coupon.discountType === CouponDiscountType.PERCENT
      ? eligibleSubtotal * (coupon.discountValue / 100)
      : coupon.discountValue;
  const cappedDiscount =
    coupon.maximumDiscount !== null
      ? Math.min(rawDiscount, coupon.maximumDiscount)
      : rawDiscount;
  const discountAmount = Number(
    Math.min(eligibleSubtotal, cappedDiscount).toFixed(2),
  );

  if (discountAmount <= 0) {
    return invalidCoupon('El cupón no genera un descuento aplicable');
  }

  return {
    valid: true,
    reason: null,
    discountAmount,
  };
}

function invalidCoupon(reason: string): CouponValidation {
  return {
    valid: false,
    reason,
    discountAmount: 0,
  };
}
