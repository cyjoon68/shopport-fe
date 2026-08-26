import type { DisplayMessage, RetailerId } from '@/features/chat';
import type { CachedProduct } from '@/shared/storage/types';

export type ChatScreenRouteParams = Readonly<{
  deletedConversationId?: string;
  id?: string;
}>;

export type ChatScreenUnreadState = Readonly<{
  chat: boolean;
  products: boolean;
}>;

export type ConversationScreenRouteParams = Readonly<{
  id?: string;
  send?: string;
}>;

export type ConversationScreenProps = Readonly<{
  conversationId?: string;
  initialSend?: boolean;
  onMessagesChange?: ((messages: ReadonlyArray<DisplayMessage>) => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
  onProviderReset?: (() => void) | undefined;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
}>;
