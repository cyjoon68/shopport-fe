import type { CachedProduct } from '@/shared/storage/database';

export const productForRoute = (
  routeId: string,
  remoteProduct: CachedProduct | null,
  cachedProduct: CachedProduct | null,
): CachedProduct | null => {
  if (remoteProduct?.id === routeId) return remoteProduct;
  return cachedProduct?.id === routeId ? cachedProduct : null;
};
