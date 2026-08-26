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
  const loadMore = (): void => {
    if (!enabledRef.current) return;
    const pageInfo = data?.conversations.pageInfo;
    if (pageInfo?.hasNextPage)
      void fetchMore({ variables: { after: pageInfo.endCursor, first: pageSize } });
  };
  return { loadMore, recommendations };
};

export const useUpdateSavedProduct = () => {
  const [saveProduct] = useMutation(SaveProductDocument);
  const [unsaveProduct] = useMutation(UnsaveProductDocument);

  return async (productId: string, isSaved: boolean): Promise<string | null> => {
    if (isSaved) {
      const result = await unsaveProduct({ variables: { input: { productId } } });
      return result.data?.unsaveProduct.userErrors[0]?.message ?? null;
    }
    const result = await saveProduct({ variables: { input: { productId } } });
    return result.data?.saveProduct.userErrors[0]?.message ?? null;
  };
};
