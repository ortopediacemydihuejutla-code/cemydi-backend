export type PromotionPricingCandidate = {
  id: number;
  discountPercent: number;
  startAt: Date;
  endAt: Date;
};

export function calculateDiscountedPrice(
  originalPrice: number,
  discountPercent: number,
) {
  return Number((originalPrice * (1 - discountPercent / 100)).toFixed(2));
}

export function getBestActivePromotion<T extends PromotionPricingCandidate>(
  promotions: T[],
  now = new Date(),
): T | null {
  const nowMs = now.getTime();

  return (
    promotions
      .filter(
        (promotion) =>
          promotion.startAt.getTime() <= nowMs &&
          promotion.endAt.getTime() >= nowMs,
      )
      .sort(
        (a, b) =>
          b.discountPercent - a.discountPercent ||
          a.endAt.getTime() - b.endAt.getTime(),
      )[0] ?? null
  );
}
