import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import type { AskUserSheetProps } from '../../types';
import { AskUserCard } from './ask-user-card';

export const AskUserSheet = ({
  loading,
  onDismiss,
  onSelect,
  request,
  visible,
}: AskUserSheetProps) => (
  <Modal
    animationType="slide"
    onRequestClose={() => void onDismiss()}
    presentationStyle="overFullScreen"
    transparent
    visible={visible}
  >
    <View style={styles.root}>
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={() => void onDismiss()}
        style={styles.backdrop}
      />
      <SafeAreaView
        accessibilityViewIsModal
        edges={['bottom']}
        style={styles.sheet}
        testID="ask-user-sheet"
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text allowFontScaling maxFontSizeMultiplier={2.5} style={styles.title}>
            Shopport의 추가 질문
          </Text>
          <Pressable
            accessibilityLabel="추가 질문 닫기"
            accessibilityRole="button"
            onPress={() => void onDismiss()}
            style={styles.close}
          >
            <Text style={styles.closeLabel}>닫기</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <AskUserCard
            disabled={loading}
            disabledMessage={loading ? '답변을 보내는 중이에요' : undefined}
            onSelect={onSelect}
            request={request}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>
);

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.scrim,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxHeight: theme.layout.conversationSheet.maxHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  scroll: { flexShrink: 1 },
  content: { paddingBottom: theme.spacing.md },
  handle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.textMuted,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    height: theme.spacing.xs,
    width: theme.layout.conversationSheet.handleWidth,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    fontWeight: '600',
    ...theme.typography.conversation.sheetTitle,
  },
  close: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
  },
  closeLabel: {
    color: theme.colors.text,
    ...theme.typography.conversation.sheetAction,
  },
}));
