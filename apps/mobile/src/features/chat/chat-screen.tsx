import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useMutation } from '@apollo/client/react';
import { Screen } from '@shopport/ui';
import {
  ConversationsDocument,
  ConversationSummaryFragmentDoc,
  CreateConversationDocument,
} from '@/graphql/generated/graphql';
import { readFragment } from '@/graphql/generated';
import { saveDraft } from '@/shared/storage/database';
import type { CachedProduct } from '@/shared/storage/database';
import { useSession } from '@/features/auth/session-provider';
import { FoundProductsContent } from '@/features/catalog/found-products-screen';
import { useOnline } from '@/providers/network-provider';
import { GlassButton, glassButtonIconSize } from '@/shared/ui/glass-button';
import { ChatSegmentedControl, type ChatTab } from './chat-segmented-control';
import { ConversationScreen } from './conversation-screen';
import { ChatNewConversation } from './chat-new-conversation';
import type { DisplayMessage } from './message-list';
import { selectAndUploadAsset } from './asset-upload';

type UnreadState = Readonly<{ chat: boolean; products: boolean }>;

export const ChatScreen = () => {
  const { theme } = useUnistyles();
  const { status } = useSession();
  const online = useOnline();
  const { id: routeId } = useLocalSearchParams<{ id?: string }>();
  const routeConversationId = typeof routeId === 'string' ? routeId : null;
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
  const [createConversation] = useMutation(CreateConversationDocument, {
    awaitRefetchQueries: true,
    refetchQueries: [ConversationsDocument],
  });
  const [conversationId, setConversationId] = useState<string | null>(
    routeConversationId,
  );
  const [sendInitialDraft, setSendInitialDraft] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ChatTab>('채팅');
  const [messages, setMessages] = useState<ReadonlyArray<DisplayMessage>>([]);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [unread, setUnread] = useState<UnreadState>({ chat: false, products: false });
  const [loading, setLoading] = useState(false);
  const seenMessageIds = useRef<Set<string> | null>(null);
  const seenProductIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    setConversationId(routeConversationId);
    setSendInitialDraft(false);
  }, [routeConversationId]);

  useEffect(() => {
    seenMessageIds.current = null;
    seenProductIds.current = null;
    setMessages([]);
    setFocusedProductId(null);
    setUnread({ chat: false, products: false });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const messageIds = new Set(messages.map(({ id }) => id));
    const productIds = new Set(
      messages.flatMap(({ products }) => products.map(({ id }) => id)),
    );
    if (!seenMessageIds.current || !seenProductIds.current) {
      seenMessageIds.current = messageIds;
      seenProductIds.current = productIds;
      return;
    }
    const hasNewAssistantMessage = messages.some(
      ({ id, role }) => role === 'assistant' && !seenMessageIds.current?.has(id),
    );
    const hasNewProduct = [...productIds].some((id) => !seenProductIds.current?.has(id));
    if (hasNewAssistantMessage && selectedTab !== '채팅')
      setUnread((state) => ({ ...state, chat: true }));
    if (hasNewProduct && selectedTab !== '상품')
      setUnread((state) => ({ ...state, products: true }));
    seenMessageIds.current = messageIds;
    seenProductIds.current = productIds;
  }, [conversationId, messages, selectedTab]);

  const handleMessagesChange = useCallback((next: ReadonlyArray<DisplayMessage>) => {
    setMessages(next);
  }, []);

  const selectTab = useCallback((next: ChatTab): void => {
    setSelectedTab(next);
    setUnread((state) => ({
      chat: next === '채팅' ? false : state.chat,
      products: next === '상품' ? false : state.products,
    }));
  }, []);

  const focusProduct = useCallback((product: CachedProduct): void => {
    setFocusedProductId(product.id);
    setSelectedTab('상품');
    setUnread((state) => ({ ...state, products: false }));
  }, []);

  const create = async (draft = '', withImage = false): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '새 대화는 온라인에서 시작할 수 있습니다.');
      return;
    }
    setLoading(true);
    try {
      const result = await createConversation({ variables: { input: {} } });
      const payload = result.data?.createConversation;
      if (!payload?.conversation) {
        Alert.alert(
          '대화를 만들지 못했습니다',
          payload?.userErrors[0]?.message ?? '다시 시도해 주세요.',
        );
        return;
      }
      const conversation = readFragment(
        ConversationSummaryFragmentDoc,
        payload.conversation,
      );
      const asset = withImage ? await selectAndUploadAsset(conversation.id) : null;
      if (draft || asset)
        await saveDraft(conversation.id, {
          text: draft,
          assetId: asset?.id ?? null,
          assetUri: asset?.uri ?? null,
        });
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
      setSendInitialDraft(Boolean(draft || asset));
      setConversationId(conversation.id);
    } catch (error) {
      Alert.alert(
        withImage ? '이미지 첨부 실패' : '대화를 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (status === 'guest') return <Redirect href="/auth" />;

  const openDrawer = (): void => {
    if (typeof navigation.openDrawer === 'function') {
      navigation.openDrawer();
      return;
    }
    router.push('/');
  };

  return (
    <Screen testID="chat-screen">
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <GlassButton
            accessibilityLabel="메뉴 열기"
            hitSlop={8}
            onPress={openDrawer}
            style={styles.headerButton}
          >
            <Image
              contentFit="contain"
              source="sf:sidebar.left"
              style={styles.headerSymbol}
              tintColor={theme.colors.text}
            />
          </GlassButton>
          <ChatSegmentedControl
            onValueChange={selectTab}
            testID="chat-segmented-control"
            unread={{ 채팅: unread.chat, 상품: unread.products }}
            value={selectedTab}
          />
          <GlassButton
            accessibilityLabel="저장한 상품 보기"
            hitSlop={8}
            onPress={() => router.push('/favorites')}
            style={styles.headerButton}
          >
            <Image
              contentFit="contain"
              source="sf:bookmark"
              style={styles.headerSymbol}
              tintColor={theme.colors.text}
            />
          </GlassButton>
        </SafeAreaView>
        <View style={styles.content}>
          <View style={selectedTab === '채팅' ? styles.visible : styles.hidden}>
            {conversationId ? (
              <ConversationScreen
                conversationId={conversationId}
                initialSend={sendInitialDraft}
                key={conversationId}
                onMessagesChange={handleMessagesChange}
                onProductSelect={focusProduct}
              />
            ) : (
              <ChatNewConversation loading={loading} onCreate={create} online={online} />
            )}
          </View>
          <View style={selectedTab === '상품' ? styles.visible : styles.hidden}>
            <FoundProductsContent focusProductId={focusedProductId} />
          </View>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, gap: theme.spacing.md, padding: theme.spacing.md },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
  content: { flex: 1 },
  visible: { flex: 1 },
  hidden: { display: 'none' },
}));
