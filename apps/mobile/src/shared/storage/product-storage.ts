import { database } from './connection';
import type { CachedProduct } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cachedProductStringFields = [
  'id',
  'title',
  'imageUrl',
  'providerId',
  'providerName',
  'amountMinor',
  'shippingMinor',
  'totalMinor',
  'currency',
  'outboundUrl',
  'observedAt',
] as const;

const isCachedProduct = (value: unknown): value is CachedProduct =>
  isRecord(value) &&
  cachedProductStringFields.every((field) => typeof value[field] === 'string') &&
  typeof value.isAffiliate === 'boolean' &&
  typeof value.isInStock === 'boolean' &&
  typeof value.isSaved === 'boolean' &&
  (value.deliveryExpectedAt === null || typeof value.deliveryExpectedAt === 'string');

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const cacheProducts = async (
  products: ReadonlyArray<CachedProduct>,
): Promise<void> => {
  const db = await database();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const product of products.slice(0, 100)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO product_cache (id, payload, updated_at) VALUES (?, ?, ?)',
        product.id,
        JSON.stringify(product),
        now,
      );
    }
    await db.runAsync(`
      DELETE FROM product_cache
      WHERE id NOT IN (
        SELECT id FROM product_cache ORDER BY updated_at DESC LIMIT 100
      )
    `);
  });
};

export const readCachedProducts = async (): Promise<Array<CachedProduct>> => {
  const db = await database();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM product_cache ORDER BY updated_at DESC LIMIT 100',
  );
  return rows.flatMap(({ payload }) => {
    const parsed = parseJson(payload);
    return isCachedProduct(parsed) ? [parsed] : [];
  });
};
