import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useMutation } from '@apollo/client/react';
import { ActionButton, Screen, SectionTitle } from '@shopport/ui';
import { CreateConversationDocument } from '@/graphql/generated/graphql';
import { ConversationSummaryFragmentDoc } from '@/graphql/generated/graphql';
import { readFragment } from '@/graphql/generated';
import { saveDraft } from '@/shared/storage/database';
import { useSession } from '@/features/auth/session-provider';
import { useOnline } from '@/providers/network-provider';

const suggestions = [
  '출퇴근용 가벼운 텀블러 찾아줘',
  '비 오는 날 쓸 튼튼한 우산 비교해줘',
  '조용한 무선 마우스 추천해줘',
] as const;

export const NewChatScreen = () => {
  const { status } = useSession();
  const online = useOnline();
  const [createConversation] = useMutation(CreateConversationDocument);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  if (status === 'guest') return <Redirect href="/auth" />;

  const create = async (draft = ''): Promise<void> => {
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
      if (draft)
        await saveDraft(conversation.id, {
          text: draft,
          assetId: null,
          assetUri: null,
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
        '대화를 만들지 못했습니다',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="new-chat-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.root}>
          <View style={styles.heading}>
            <SectionTitle>무엇을 찾고 있나요?</SectionTitle>
            <Text allowFontScaling style={styles.description}>
              조건을 편하게 말해 주세요. 같이 좁혀볼게요.
            </Text>
          </View>
          <View accessibilityLabel="추천 질문" style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <Pressable
                accessibilityRole="button"
                disabled={loading || !online}
                key={suggestion}
                onPress={() => void create(suggestion)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text allowFontScaling style={styles.suggestionText}>
                  {suggestion}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="쇼핑 질문"
              editable={!loading}
              maxLength={2_000}
              multiline
              onChangeText={setText}
              placeholder="찾는 상품을 알려주세요"
              placeholderTextColor={styles.placeholder.color}
              style={styles.input}
              value={text}
            />
            <ActionButton
              disabled={loading || !online || !text.trim()}
              onPress={() => void create(text.trim())}
            >
              {loading ? '준비 중' : '보내기'}
            </ActionButton>
          </View>
          {loading ? <ActivityIndicator accessibilityLabel="대화 준비 중" /> : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  keyboard: { flex: 1 },
  root: {
    flex: 1,
    gap: theme.spacing.xl,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  heading: { gap: theme.spacing.md },
  description: { color: theme.colors.textMuted, fontSize: 17, lineHeight: 26 },
  suggestions: { gap: theme.spacing.md },
  suggestion: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    minHeight: 56,
    padding: theme.spacing.lg,
  },
  pressed: { opacity: 0.72 },
  suggestionText: { color: theme.colors.text, fontSize: 16, lineHeight: 23 },
  composer: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
    maxHeight: 144,
    minHeight: 56,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  placeholder: { color: theme.colors.textMuted },
}));
