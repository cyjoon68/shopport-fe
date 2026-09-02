import { useMutation, useQuery } from '@apollo/client/react';
import { useRef } from 'react';

import {
  FoundProductsDocument,
  SaveProductDocument,
  UnsaveProductDocument,
} from '@/graphql/generated/graphql';

import { recommendedProductFromFragment } from '../domain/models';
import type { RecommendedProduct } from '../types';

const pageSize = 20;

export const useFoundProductRecommendations = (enabled: boolean) => {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const activeCursorsRef = useRef(new Set<string>());
  const { data, fetchMore } = useQuery(FoundProductsDocument, {
    variables: { first: pageSize },
    fetchPolicy: 'cache-and-network',
    skip: !enabled,
  });
  const recommendations: Array<RecommendedProduct> =
    data?.conversations.edges.flatMap(({ node }) =>
      node.messages.flatMap(({ parts }) =>
        parts.flatMap((part) =>
          part.__typename === 'ProductReferenceMessagePart'
            ? [recommendedProductFromFragment(part.product, part.aiSummary)]
            : [],
        ),
      ),
    ) ?? [];
  const loadMore = async (): Promise<void> => {
    if (!enabledRef.current) return;
    const pageInfo = data?.conversations.pageInfo;
    const cursor = pageInfo?.endCursor;
    if (!pageInfo?.hasNextPage || !cursor || activeCursorsRef.current.has(cursor)) return;
    activeCursorsRef.current.add(cursor);
    try {
      await fetchMore({ variables: { after: cursor, first: pageSize } });
    } finally {
      activeCursorsRef.current.delete(cursor);
    }
  };
  return { loadMore, recommendations };
};

export const useUpdateSavedProduct = () => {
  const [saveProduct] = useMutation(SaveProductDocument);
  const [unsaveProduct] = useMutation(UnsaveProductDocument);

  return async (productId: string, isSaved: boolean): Promise<string | null> => {
    if (isSaved) {
      const result = await unsaveProduct({ variables: { input: { productId } } });
      const payload = result.data?.unsaveProduct;
      if (!payload || payload.userErrors.length > 0)
        return payload?.userErrors[0]?.message || '찜을 변경하지 못했습니다.';
      return payload.product ? null : '찜을 변경하지 못했습니다.';
    }
    const result = await saveProduct({ variables: { input: { productId } } });
    const payload = result.data?.saveProduct;
    if (!payload || payload.userErrors.length > 0)
      return payload?.userErrors[0]?.message || '찜을 변경하지 못했습니다.';
    return payload.product ? null : '찜을 변경하지 못했습니다.';
  };
};
