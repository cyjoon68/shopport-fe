import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type ChatPreviewState = 'loading' | 'error' | 'imageProcessing' | 'largeType';

export const ChatStatePreview = ({ state }: Readonly<{ state: ChatPreviewState }>) => {
  styles.useVariants({ largeType: state === 'largeType' });
  return (
    <View style={styles.root}>
      <View style={styles.messages}>
        <View style={styles.userBubble}>
          <Text allowFontScaling style={styles.userText}>
            출퇴근용으로 가벼운 텀블러를 추천해 줘
          </Text>
        </View>
        <View style={styles.assistantBubble}>
          <Text allowFontScaling style={styles.assistantText}>
            가격과 배송비를 포함해 비교하고 있어요.
          </Text>
        </View>
      </View>
      {state === 'error' ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.
        </Text>
      ) : null}
      {state === 'imageProcessing' ? (
        <View style={styles.attachment}>
          <View style={styles.thumbnail} />
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            이미지 처리 중
          </Text>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Text style={styles.placeholder}>원하는 상품과 조건을 알려주세요</Text>
        <View style={styles.sendButton}>
          <Text style={styles.sendLabel}>{state === 'loading' ? '중지' : '전송'}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { backgroundColor: theme.colors.background, flex: 1, justifyContent: 'flex-end' },
  messages: { flex: 1, gap: theme.spacing.lg, padding: theme.spacing.lg },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.lg,
    maxWidth: '88%',
    padding: theme.spacing.lg,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    maxWidth: '88%',
    padding: theme.spacing.lg,
  },
  userText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    lineHeight: 24,
    variants: { largeType: { true: { fontSize: 28, lineHeight: 38 } } },
  },
  assistantText: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
    variants: { largeType: { true: { fontSize: 28, lineHeight: 38 } } },
  },
  error: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.danger,
    padding: theme.spacing.md,
    textAlign: 'center',
  },
  attachment: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  thumbnail: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    height: 64,
    width: 64,
  },
  status: { color: theme.colors.textMuted, fontSize: 14 },
  composer: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  placeholder: {
    color: theme.colors.textMuted,
    flex: 1,
    fontSize: 16,
    variants: { largeType: { true: { fontSize: 28, lineHeight: 38 } } },
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.pill,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  sendLabel: { color: theme.colors.primaryText, fontSize: 14, fontWeight: '800' },
}));
