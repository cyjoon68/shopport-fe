import type { CachedProduct } from '@/shared/storage/database';

import type { DisplayMessage } from './message-model';

const cachedProductKeys = [
  'id',
  'title',
  'imageUrl',
  'providerId',
  'providerName',
  'amountMinor',
  'shippingMinor',
  'totalMinor',
  'currency',
  'isAffiliate',
  'isInStock',
  'outboundUrl',
  'deliveryExpectedAt',
  'observedAt',
  'isSaved',
] as const satisfies ReadonlyArray<keyof CachedProduct>;

const hasSameProduct = (left: CachedProduct, right: CachedProduct): boolean =>
  cachedProductKeys.every((key) => left[key] === right[key]);

const hasSameProducts = (
  left: ReadonlyArray<CachedProduct>,
  right: ReadonlyArray<CachedProduct>,
): boolean =>
  left.length === right.length &&
  left.every((product, index) => {
    const other = right[index];
    return other ? hasSameProduct(product, other) : false;
  });

export const hasSameChatScreenProjection = (
  left: ReadonlyArray<DisplayMessage>,
  right: ReadonlyArray<DisplayMessage>,
): boolean =>
  left.length === right.length &&
  left.every((message, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      message.id === other.id &&
      message.role === other.role &&
      hasSameProducts(message.products, other.products) &&
      message.recommendations.length === other.recommendations.length &&
      message.recommendations.every((recommendation, recommendationIndex) => {
        const nextRecommendation = other.recommendations[recommendationIndex];
        return (
          nextRecommendation !== undefined &&
          recommendation.aiSummary === nextRecommendation.aiSummary &&
          hasSameProduct(recommendation.product, nextRecommendation.product)
        );
      })
    );
  });
