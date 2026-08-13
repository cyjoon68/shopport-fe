import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
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
        await saveDraft(conversation.id, { text: draft, assetId: null, assetUri: null });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="new-chat-screen">
      <View style={styles.root}>
        <View style={styles.heading}>
          <SectionTitle>오늘은 무엇을 찾을까요?</SectionTitle>
          <Text allowFontScaling style={styles.description}>
            원하는 조건을 말하면 가격, 배송, 재고를 같은 기준으로 비교합니다.
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
        <ActionButton disabled={loading || !online} onPress={() => void create()}>
          {loading ? '대화 준비 중' : '새 대화 시작'}
        </ActionButton>
        {loading ? <ActivityIndicator accessibilityLabel="대화 준비 중" /> : null}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
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
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    minHeight: 56,
    padding: theme.spacing.lg,
  },
  pressed: { opacity: 0.72 },
  suggestionText: { color: theme.colors.text, fontSize: 16, lineHeight: 23 },
}));
