import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { Redirect, router, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useMutation } from '@apollo/client/react';
import { Screen } from '@shopport/ui';
import { CreateConversationDocument } from '@/graphql/generated/graphql';
import { ConversationSummaryFragmentDoc } from '@/graphql/generated/graphql';
import { readFragment } from '@/graphql/generated';
import { saveDraft } from '@/shared/storage/database';
import { useReducedTransparency } from '@/shared/accessibility/use-reduced-transparency';
import { useSession } from '@/features/auth/session-provider';
import { FoundProductsContent } from '@/features/catalog/found-products-screen';
import { useOnline } from '@/providers/network-provider';
import { GlassButton, glassButtonIconSize } from '@/shared/ui/glass-button';
import { selectAndUploadAsset } from './asset-upload';
import { ChatSegmentedControl, type ChatTab } from './chat-segmented-control';

export const NewChatScreen = () => {
  const { theme } = useUnistyles();
  const { status } = useSession();
  const online = useOnline();
  const reducedTransparency = useReducedTransparency();
  const [createConversation] = useMutation(CreateConversationDocument);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<ChatTab>('채팅');
  const [text, setText] = useState('');
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();
  const glassAvailable =
    Platform.OS === 'ios' && !reducedTransparency && isGlassEffectAPIAvailable();
  if (status === 'guest') return <Redirect href="/auth" />;

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
      router.push({
        pathname: '/chat/[id]',
        params: draft ? { id: conversation.id, send: '1' } : { id: conversation.id },
      });
    } catch (error) {
      Alert.alert(
        withImage ? '이미지 첨부 실패' : '대화를 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  const sendDisabled = loading || !online || !text.trim();
  const imageDisabled = loading || !online;
  const composerContent = (
    <>
      <GlassButton
        accessibilityLabel="이미지 첨부"
        disabled={imageDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={() => void create(text.trim(), true)}
        style={styles.composerButton}
      >
        <Image
          contentFit="contain"
          source="sf:photo"
          style={styles.composerSymbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
      <TextInput
        accessibilityLabel="쇼핑 질문"
        editable={!loading}
        enablesReturnKeyAutomatically
        maxLength={2_000}
        onChangeText={setText}
        onSubmitEditing={() => {
          if (!sendDisabled) void create(text.trim());
        }}
        placeholder="Shopport에게 추천받기"
        placeholderTextColor={styles.placeholder.color}
        returnKeyType="send"
        style={styles.input}
        value={text}
      />
      <GlassButton
        accessibilityLabel="메시지 보내기"
        disabled={sendDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={() => void create(text.trim())}
        style={styles.composerButton}
        tintColor={
          sendDisabled ? theme.colors.surfaceMuted : theme.colors.background
        }
      >
        <Image
          contentFit="contain"
          source="sf:arrow.up"
          style={styles.composerSymbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
    </>
  );

  return (
    <Screen testID="new-chat-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.root}>
          <SafeAreaView edges={['top']} style={styles.header}>
            <GlassButton
              accessibilityLabel="메뉴 열기"
              hitSlop={8}
              onPress={() => navigation.openDrawer()}
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
              onValueChange={setSelectedTab}
              testID="new-chat-segmented-control"
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
            {selectedTab === '상품' ? <FoundProductsContent /> : null}
          </View>
          {selectedTab === '채팅' && glassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              style={styles.glassComposer}
            >
              {composerContent}
            </GlassView>
          ) : selectedTab === '채팅' ? (
            <View style={styles.fallbackComposer}>{composerContent}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  keyboard: { flex: 1 },
  root: {
    flex: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  content: { flex: 1 },
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
  glassComposer: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
  },
  fallbackComposer: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
  },
  input: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'center',
  },
  composerButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  composerButtonFallback: { backgroundColor: theme.colors.surfaceMuted },
  composerSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
  placeholder: { color: theme.colors.textMuted },
  headerSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
}));
