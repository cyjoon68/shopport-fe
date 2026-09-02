import type { FragmentType } from '@/graphql/generated';
import { readFragment } from '@/graphql/generated';
import { ProductCardFragmentDoc } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/types';

import type { RecommendedProduct } from '../types';

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
    availability: product.offer.availability,
    outboundUrl: product.offer.outboundUrl,
    deliveryExpectedAt: product.offer.deliveryExpectedAt ?? null,
    observedAt: product.offer.observedAt,
    isSaved: product.isSaved,
  };
};

export const recommendedProductFromFragment = (
  fragment: FragmentType<typeof ProductCardFragmentDoc>,
  aiSummary: string | null,
): RecommendedProduct => ({ product: productFromFragment(fragment), aiSummary });
