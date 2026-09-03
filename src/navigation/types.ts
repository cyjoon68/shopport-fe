import type { Href } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';

import type { PlatformIconName } from '@/shared/components';

export type DrawerConversation = Readonly<{
  id: string;
  title: string;
}>;

export type DrawerLinkProps = Readonly<{
  label: string;
  onPress: () => void;
  symbol: PlatformIconName;
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
