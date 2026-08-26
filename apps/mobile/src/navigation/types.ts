import type { Href } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';

export type DrawerConversation = Readonly<{
  id: string;
  title: string;
}>;

export type ConversationActionHandlersProps = Readonly<{
  conversation: DrawerConversation | null;
  onDeleted: (conversationId: string) => void;
  online: boolean;
  pinned: boolean;
  onPinnedChange: (conversationId: string, pinned: boolean) => void;
  onRefresh: () => Promise<unknown>;
}>;

export type DrawerLinkProps = Readonly<{
  label: string;
  onPress: () => void;
  symbol: string;
}>;

export type ConversationLinkProps = Readonly<{
  conversation: DrawerConversation;
  onDeleted: (conversationId: string) => void;
  online: boolean;
  onPinnedChange: (conversationId: string, pinned: boolean) => void;
  onOpen: () => void;
  onRefresh: () => Promise<unknown>;
  pinned: boolean;
}>;

export type ShopportDrawerContentProps = DrawerContentComponentProps;

export type NavigationHref = Href;
