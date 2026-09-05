import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import { ProductList } from '@/features/catalog';
import {
  ChatNewConversation,
  ChatScreenHeader,
  type ChatTab,
  type DisplayMessage,
  hasSameChatScreenProjection,
  removeUploadedAsset,
  type RetailerId,
  retailerIds,
  selectAndUploadAsset,
} from '@/features/chat';
import { useCreateConversation } from '@/features/chat/api/hooks';
import { NetworkBoundary, useOnline } from '@/providers/network-provider';
import { Screen } from '@/shared/components';
import { saveDraft } from '@/shared/storage';
import type { CachedProduct } from '@/shared/storage/types';

import { ConversationScreen } from './conversation-screen';
import type { ChatScreenRouteParams, ChatScreenUnreadState } from './types';

export const ChatScreen = () => {
  const { status } = useSession();
  const networkOnline = useOnline();
  const remoteWorkRef = useRef(false);
  const online = status === 'authenticated' && networkOnline;
  remoteWorkRef.current = online;

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <NetworkBoundary online={online}>
      <ChatContent online={online} remoteWorkRef={remoteWorkRef} />
    </NetworkBoundary>
  );
};

const ChatContent = ({
  online,
  remoteWorkRef,
}: Readonly<{
  online: boolean;
  remoteWorkRef: MutableRefObject<boolean>;
}>) => {
  const { deletedConversationId, id: routeId } =
    useLocalSearchParams<ChatScreenRouteParams>();
  const routeConversationId =
    typeof routeId === 'string' && routeId.length > 0 ? routeId : null;
  const deletedConversation =
    typeof deletedConversationId === 'string' ? deletedConversationId : null;
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
  const createConversation = useCreateConversation();
  const [conversationId, setConversationId] = useState<string | null>(
    routeConversationId,
  );
  const [sendInitialDraft, setSendInitialDraft] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ChatTab>('채팅');
  const [messages, setMessages] = useState<ReadonlyArray<DisplayMessage>>([]);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [unread, setUnread] = useState<ChatScreenUnreadState>({
    chat: false,
    products: false,
  });
  const [loading, setLoading] = useState(false);
  const [providerIds, setProviderIds] = useState<ReadonlyArray<RetailerId>>([]);
  const trackedConversationId = useRef<string | null>(null);
  const seenMessageIds = useRef<Set<string> | null>(null);
  const seenProductIds = useRef<Set<string> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setConversationId(routeConversationId);
    setSendInitialDraft(false);
    setProviderIds([]);
  }, [routeConversationId]);

  useEffect(() => {
    if (!deletedConversation) return;
    if (deletedConversation === conversationId) {
      setConversationId(null);
      setSendInitialDraft(false);
      setProviderIds([]);
      setSelectedTab('채팅');
      router.setParams({ deletedConversationId: undefined, id: undefined });
      return;
    }
    router.setParams({ deletedConversationId: undefined });
  }, [conversationId, deletedConversation]);

  useEffect(() => {
    trackedConversationId.current = null;
    seenMessageIds.current = null;
    seenProductIds.current = null;
    setMessages([]);
    setFocusedProductId(null);
    setFocusRequestId(0);
    setUnread({ chat: false, products: false });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (trackedConversationId.current !== conversationId) {
      trackedConversationId.current = conversationId;
      seenMessageIds.current = null;
      seenProductIds.current = null;
      return;
    }
    if (messages.length === 0) return;
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

  const handleMessagesChange = (next: ReadonlyArray<DisplayMessage>): void => {
    setMessages((current) =>
      hasSameChatScreenProjection(current, next) ? current : next,
    );
  };

  const selectTab = (next: ChatTab): void => {
    setSelectedTab(next);
    setUnread((state) => ({
      chat: next === '채팅' ? false : state.chat,
      products: next === '상품' ? false : state.products,
    }));
  };

  const focusProduct = (product: CachedProduct): void => {
    setFocusedProductId(product.id);
    setFocusRequestId((current) => current + 1);
    setSelectedTab('상품');
    setUnread((state) => ({ ...state, products: false }));
  };

  const toggleProvider = (providerId: RetailerId): void => {
    setProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : retailerIds.filter((id) => current.includes(id) || id === providerId),
    );
  };

  const resetProviders = (): void => setProviderIds([]);

  const cleanupOwnedAsset = async (id: string): Promise<void> => {
    if (!remoteWorkRef.current) return;
    try {
      await removeUploadedAsset(id);
    } catch {
      return;
    }
  };

  const create = async (draft = '', withImage = false): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '새 대화는 온라인에서 시작할 수 있습니다.');
      return;
    }
    setLoading(true);
    let ownedAssetId: string | null = null;
    try {
      const result = await createConversation();
      if (!mountedRef.current) return;
      if (!result.conversation) {
        Alert.alert('대화를 만들지 못했습니다', result.error);
        return;
      }
      const { conversation } = result;
      if (withImage && !remoteWorkRef.current) return;
      const asset = withImage ? await selectAndUploadAsset(conversation.id) : null;
      ownedAssetId = asset?.id ?? null;
      if (!mountedRef.current) {
        if (ownedAssetId) await cleanupOwnedAsset(ownedAssetId);
        return;
      }
      if (draft || asset) {
        await saveDraft(conversation.id, {
          text: draft,
          assetId: asset?.id ?? null,
          assetUri: asset?.uri ?? null,
        });
        ownedAssetId = null;
      }
      if (!mountedRef.current) return;
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
      if (!mountedRef.current) return;
      setSendInitialDraft(Boolean(draft || asset));
      setConversationId(conversation.id);
    } catch (error) {
      if (ownedAssetId) await cleanupOwnedAsset(ownedAssetId);
      if (!mountedRef.current) return;
      Alert.alert(
        withImage ? '이미지 첨부 실패' : '대화를 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const openDrawer = (): void => {
    if (typeof navigation.openDrawer === 'function') {
      navigation.openDrawer();
      return;
    }
    router.push('/');
  };

  const openFavorites = (): void => {
    router.push('/favorites');
  };

  return (
    <Screen testID="chat-screen">
      <View style={styles.root}>
        <ChatScreenHeader
          onOpenDrawer={openDrawer}
          onOpenFavorites={openFavorites}
          onValueChange={selectTab}
          unread={{ 채팅: unread.chat, 상품: unread.products }}
          value={selectedTab}
        />
        <View style={styles.content}>
          <View style={selectedTab === '채팅' ? styles.visible : styles.hidden}>
            {conversationId ? (
              <ConversationScreen
                conversationId={conversationId}
                initialSend={sendInitialDraft}
                key={conversationId}
                onMessagesChange={handleMessagesChange}
                onProductSelect={focusProduct}
                onProviderReset={resetProviders}
                onProviderToggle={toggleProvider}
                providerIds={providerIds}
                remoteWorkRef={remoteWorkRef}
              />
            ) : (
              <ChatNewConversation
                loading={loading}
                onCreate={create}
                onProviderToggle={toggleProvider}
                online={online}
                providerIds={providerIds}
              />
            )}
          </View>
          <View style={selectedTab === '상품' ? styles.visible : styles.hidden}>
            <ProductList
              conversationRecommendations={messages.flatMap(
                ({ recommendations }) => recommendations,
              )}
              focusProductId={focusedProductId}
              focusRequestId={focusRequestId}
              presentation="recommendations"
              scope="conversation"
            />
          </View>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, gap: theme.spacing.md, padding: theme.spacing.md },
  content: { flex: 1 },
  visible: { flex: 1 },
  hidden: { display: 'none' },
}));
