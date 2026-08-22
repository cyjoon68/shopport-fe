import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import type { Href } from 'expo-router';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { useQuery } from '@apollo/client/react';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { readFragment } from '@/graphql/generated';
import {
  ConversationSummaryFragmentDoc,
  ConversationsDocument,
} from '@/graphql/generated/graphql';
import { conversationHref } from '@/features/chat';
import { useSession } from '@/features/auth/session-provider';
import { useOnline } from '@/providers/network-provider';
import { readPinnedConversationIds } from '@/shared/storage/database';
import { GlassButton, glassButtonIconSize } from '@/shared/ui/glass-button';
import {
  useConversationActionHandlers,
  type DrawerConversation,
} from './conversation-action-handlers';

type DrawerLinkProps = Readonly<{
  label: string;
  onPress: () => void;
  symbol: string;
}>;

const DrawerLink = ({ label, onPress, symbol }: DrawerLinkProps) => {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Image
        contentFit="contain"
        source={`sf:${symbol}`}
        style={styles.linkSymbol}
        tintColor={theme.colors.text}
      />
      <Text allowFontScaling style={styles.linkLabel}>
        {label}
      </Text>
    </Pressable>
  );
};

type ConversationLinkProps = Readonly<{
  conversation: DrawerConversation;
  onDeleted: (conversationId: string) => void;
  online: boolean;
  pinned: boolean;
  onPinnedChange: (conversationId: string, pinned: boolean) => void;
  onOpen: () => void;
  onRefresh: () => Promise<unknown>;
}>;

const ConversationLink = ({
  conversation,
  onDeleted,
  online,
  pinned,
  onPinnedChange,
  onOpen,
  onRefresh,
}: ConversationLinkProps) => {
  const { theme } = useUnistyles();
  const { remove, rename, togglePin } = useConversationActionHandlers({
    conversation,
    onDeleted,
    onPinnedChange,
    onRefresh,
    online,
    pinned,
  });

  return (
    <Link asChild href={conversationHref(conversation.id)}>
      <Link.Trigger>
        <Pressable
          accessible
          accessibilityHint="대화를 열고, 길게 누르면 메뉴를 엽니다"
          accessibilityLabel={conversation.title}
          accessibilityRole="button"
          onPress={onOpen}
          style={styles.conversation}
        >
          <View style={styles.conversationContent}>
            <Text allowFontScaling numberOfLines={2} style={styles.conversationTitle}>
              {conversation.title}
            </Text>
            {pinned ? (
              <Image
                contentFit="contain"
                source="sf:pin.fill"
                style={styles.pinSymbol}
                tintColor={theme.colors.textMuted}
              />
            ) : null}
          </View>
        </Pressable>
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction
          icon={pinned ? 'pin.slash' : 'pin.fill'}
          onPress={togglePin}
          title={pinned ? '고정 해제' : '고정'}
        />
        <Link.MenuAction icon="pencil" onPress={rename} title="이름 바꾸기" />
        <Link.MenuAction destructive icon="trash" onPress={remove} title="삭제" />
      </Link.Menu>
    </Link>
  );
};

export const ShopportDrawerContent = ({ navigation }: DrawerContentComponentProps) => {
  const { theme } = useUnistyles();
  const { status } = useSession();
  const online = useOnline();
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(new Set());
  const { data, refetch } = useQuery(ConversationsDocument, {
    fetchPolicy: 'cache-and-network',
    skip: status !== 'authenticated',
  });
  const conversations = useMemo<ReadonlyArray<DrawerConversation>>(() => {
    const items =
      data?.conversations.edges.map(({ node }) => {
        const conversation = readFragment(ConversationSummaryFragmentDoc, node);
        return { id: conversation.id, title: conversation.title };
      }) ?? [];
    return [...items].sort(
      (left, right) => Number(pinnedIds.has(right.id)) - Number(pinnedIds.has(left.id)),
    );
  }, [data?.conversations.edges, pinnedIds]);
  useEffect(() => {
    if (status !== 'authenticated') return;
    void readPinnedConversationIds()
      .then((ids) => setPinnedIds(new Set(ids)))
      .catch(() => undefined);
  }, [status]);

  const navigate = (href: Href): void => {
    navigation.closeDrawer();
    router.push(href);
  };

  const openNewConversation = (): void => {
    navigation.closeDrawer();
    router.replace({
      pathname: '/',
      params: { deletedConversationId: '', id: '' },
    });
  };

  const updatePinned = (conversationId: string, pinned: boolean): void => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (pinned) next.add(conversationId);
      else next.delete(conversationId);
      return next;
    });
  };

  const signalDeletedConversation = (conversationId: string): void => {
    navigation.closeDrawer();
    router.setParams({ deletedConversationId: conversationId });
  };

  if (status !== 'authenticated') return null;

  return (
    <DrawerContentScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" allowFontScaling style={styles.title}>
          Shopport
        </Text>
        <GlassButton
          accessibilityLabel="대화 기록 검색"
          hitSlop={8}
          onPress={() => navigate('/history')}
          style={styles.searchButton}
        >
          <Image
            contentFit="contain"
            source="sf:magnifyingglass"
            style={styles.searchSymbol}
            tintColor={theme.colors.text}
          />
        </GlassButton>
      </View>
      <View style={styles.links}>
        <DrawerLink
          label="새로운 대화 열기"
          onPress={openNewConversation}
          symbol="square.and.pencil"
        />
        <DrawerLink
          label="상품 리스트 보기"
          onPress={() => navigate('/products')}
          symbol="bag"
        />
        <DrawerLink
          label="저장한 상품 보기"
          onPress={() => navigate('/favorites')}
          symbol="bookmark"
        />
        <DrawerLink
          label="업로드한 이미지 보기"
          onPress={() => navigate('/images')}
          symbol="photo.on.rectangle"
        />
      </View>
      <View style={styles.recent}>
        <Text allowFontScaling style={styles.recentTitle}>
          최근 대화
        </Text>
        {conversations?.length ? (
          conversations.map((conversation) => (
            <ConversationLink
              key={conversation.id}
              conversation={conversation}
              online={online}
              onDeleted={signalDeletedConversation}
              onPinnedChange={updatePinned}
              onOpen={() => navigation.closeDrawer()}
              onRefresh={refetch}
              pinned={pinnedIds.has(conversation.id)}
            />
          ))
        ) : (
          <Text allowFontScaling style={styles.empty}>
            최근 대화가 없습니다.
          </Text>
        )}
      </View>
    </DrawerContentScrollView>
  );
};

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.spacing.xl, padding: theme.spacing.lg },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  searchButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  searchSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
  links: { gap: theme.spacing.xs },
  link: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 48,
    paddingHorizontal: theme.spacing.sm,
  },
  linkSymbol: { height: 20, width: 20 },
  linkLabel: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  recent: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.lg,
  },
  recentTitle: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' },
  conversation: {
    alignSelf: 'stretch',
    borderRadius: theme.radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: theme.spacing.sm,
    width: '100%',
  },
  conversationContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  conversationTitle: { color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  pinSymbol: { height: 16, width: 16 },
  empty: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.58 },
}));
