import { useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';

import { productFromFragment } from '@/features/catalog/domain/models';
import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { cacheProducts, readCachedProducts } from '@/shared/storage';
import type { CachedProduct } from '@/shared/storage/types';

const pageSize = 20;

export const useSavedProducts = (enabled: boolean) => {
  const { data, fetchMore } = useQuery(SavedProductsDocument, {
    variables: { first: pageSize },
    fetchPolicy: 'cache-and-network',
    skip: !enabled,
  });
  const productEdges = data?.savedProducts.edges;
  const [cachedProducts, setCachedProducts] = useState<Array<CachedProduct>>([]);

  useEffect(() => {
    if (productEdges?.length) {
      const products = productEdges.map(({ node }) => productFromFragment(node));
      void cacheProducts(products).catch(() => undefined);
      setCachedProducts(products);
      return;
    }
    let active = true;
    void readCachedProducts()
      .then((items) => {
        if (active) setCachedProducts(items.filter(({ isSaved }) => isSaved));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [productEdges]);

  const products = productEdges?.map(({ node }) => productFromFragment(node));
  const loadMore = (): void => {
    const pageInfo = data?.savedProducts.pageInfo;
    if (pageInfo?.hasNextPage)
      void fetchMore({ variables: { after: pageInfo.endCursor, first: pageSize } });
  };
  return { loadMore, products: products ?? cachedProducts };
};
