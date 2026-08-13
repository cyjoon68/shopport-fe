import type { FragmentType } from '@/graphql/generated';
import { readFragment } from '@/graphql/generated';
import { ProductCardFragmentDoc } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/database';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringField = (record: Record<string, unknown>, field: string): string | null => {
  const value = record[field];
  return typeof value === 'string' ? value : null;
};

export const productFromFragment = (
  fragment: FragmentType<typeof ProductCardFragmentDoc>,
): CachedProduct => {
  const product = readFragment(ProductCardFragmentDoc, fragment);
  return {
    id: product.id,
    title: product.title,
    imageUrl: product.imageUrl,
    providerId: product.provider.providerId,
    providerName: product.provider.displayName,
    amountMinor: product.offer.price.amountMinor,
    shippingMinor: product.offer.shipping.amountMinor,
    totalMinor: product.offer.total.amountMinor,
    currency: product.offer.total.currency,
    isAffiliate: product.isAffiliate,
    isInStock: product.offer.isInStock,
    outboundUrl: product.offer.outboundUrl,
    deliveryExpectedAt: product.offer.deliveryExpectedAt ?? null,
    observedAt: product.offer.observedAt,
    isSaved: product.isSaved,
  };
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
  const outboundUrl = stringField(value.offer, 'outboundUrl');
  const observedAt = stringField(value.offer, 'observedAt');
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
    outboundUrl,
    deliveryExpectedAt,
    observedAt,
    isSaved: value.isSaved,
  };
};

export const productsFromToolResult = (content: unknown): Array<CachedProduct> => {
  let parsed: unknown;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return [];
  }
  if (
    !isRecord(parsed) ||
    parsed.kind !== 'product_cards' ||
    !Array.isArray(parsed.products)
  ) {
    return [];
  }
  return parsed.products.flatMap((product) => {
    const result = parseProduct(product);
    return result ? [result] : [];
  });
};

export const formatMoney = (amountMinor: string, currency: string): string => {
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(BigInt(amountMinor));
  } catch {
    return `${amountMinor} ${currency}`;
  }
};
