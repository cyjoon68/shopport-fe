import type { CachedProduct } from '@/shared/storage/types';

import type { ProductRecommendationSummary } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringField = (record: Record<string, unknown>, field: string): string | null => {
  const value = record[field];
  return typeof value === 'string' ? value : null;
};

const httpsUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const parseProduct = (value: unknown): CachedProduct | null => {
  if (!isRecord(value) || !isRecord(value.provider) || !isRecord(value.offer))
    return null;
  const price = value.offer.price;
  const shipping = value.offer.shipping;
  const total = value.offer.total;
  if (!isRecord(price) || !isRecord(shipping) || !isRecord(total)) return null;
  const id = stringField(value, 'id');
  const title = stringField(value, 'title');
  const imageUrl = stringField(value, 'imageUrl');
  const providerId = stringField(value.provider, 'providerId');
  const providerName = stringField(value.provider, 'displayName');
  const amountMinor = stringField(price, 'amountMinor');
  const shippingMinor = stringField(shipping, 'amountMinor');
  const totalMinor = stringField(total, 'amountMinor');
  const currency = stringField(total, 'currency');
  const rawOutboundUrl = stringField(value.offer, 'outboundUrl');
  const outboundUrl = rawOutboundUrl ? httpsUrl(rawOutboundUrl) : null;
  const observedAt = stringField(value.offer, 'observedAt');
  const availability = value.offer.availability;
  const deliveryExpectedAt = value.offer.deliveryExpectedAt;
  if (
    !id ||
    !title ||
    !imageUrl ||
    !providerId ||
    !providerName ||
    !amountMinor ||
    shippingMinor === null ||
    !totalMinor ||
    !currency ||
    !outboundUrl ||
    !observedAt ||
    typeof value.isAffiliate !== 'boolean' ||
    typeof value.isSaved !== 'boolean' ||
    typeof value.offer.isInStock !== 'boolean' ||
    (availability !== undefined &&
      availability !== 'IN_STOCK' &&
      availability !== 'OUT_OF_STOCK' &&
      availability !== 'UNKNOWN') ||
    (deliveryExpectedAt !== null && typeof deliveryExpectedAt !== 'string')
  ) {
    return null;
  }
  return {
    id,
    title,
    imageUrl,
    providerId,
    providerName,
    amountMinor,
    shippingMinor,
    totalMinor,
    currency,
    isAffiliate: value.isAffiliate,
    isInStock: value.offer.isInStock,
    availability: availability ?? 'UNKNOWN',
    outboundUrl,
    deliveryExpectedAt,
    observedAt,
    isSaved: value.isSaved,
  };
};

const parseToolResult = (content: unknown): Record<string, unknown> | null => {
  let parsed: unknown;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
};

export const productsFromToolResult = (content: unknown): Array<CachedProduct> => {
  const parsed = parseToolResult(content);
  if (!parsed || parsed.kind !== 'product_cards' || !Array.isArray(parsed.products)) {
    return [];
  }
  return parsed.products.flatMap((product) => {
    const result = parseProduct(product);
    return result ? [result] : [];
  });
};

export const productRecommendationSummariesFromToolResult = (
  content: unknown,
): Array<ProductRecommendationSummary> => {
  const parsed = parseToolResult(content);
  if (
    !parsed ||
    parsed.kind !== 'product_recommendations' ||
    !Array.isArray(parsed.recommendations)
  ) {
    return [];
  }
  return parsed.recommendations.flatMap((recommendation) => {
    if (!isRecord(recommendation)) return [];
    const productId = stringField(recommendation, 'productId');
    const aiSummary = stringField(recommendation, 'aiSummary');
    return productId && aiSummary ? [{ productId, aiSummary }] : [];
  });
};
