import type { CachedProduct } from '@/shared/storage/types';

export type RecommendedProduct = Readonly<{
  product: CachedProduct;
  aiSummary: string | null;
}>;

export type ProductRecommendationSummary = Readonly<{
  productId: string;
  aiSummary: string;
}>;

export type ProductPresentation = 'catalog' | 'recommendations';

export type ProductScope = 'all-conversations' | 'conversation';

export type ProductCardProps = Readonly<{
  compact?: boolean;
  highlighted?: boolean;
  horizontal?: boolean;
  product: CachedProduct;
}>;

export type ProductListProps = Readonly<{
  conversationRecommendations?: ReadonlyArray<RecommendedProduct>;
  focusProductId?: string | null;
  presentation?: ProductPresentation;
  scope?: ProductScope;
}>;

export type ProductListItemProps = Readonly<{
  highlighted: boolean;
  item: RecommendedProduct;
  presentation: ProductPresentation;
}>;
