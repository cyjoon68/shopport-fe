import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import type { RetailerId } from './chat-composer-types';

const retailerActions = [
  { id: 'oliveyoung', label: '올리브영' },
  { id: 'daiso', label: '다이소' },
] as const satisfies ReadonlyArray<Readonly<{ id: RetailerId; label: string }>>;

const promptGroups = {
  lowest: {
    label: '최저가 찾기',
    prompts: ['토너 패드 최저가 찾아줘', '파우더 최저가 찾아줘', '선크림 최저가 찾아줘'],
  },
  recommend: {
    label: '추천받기',
    prompts: [
      '모공 관리에 좋은 앰플 추천해줘',
      '지성 피부에 맞는 쿠션 파데 추천해줘',
      '다이어트할때 먹을 수 있는 간식 추천해줘',
    ],
  },
  alternative: {
    label: '대체품 찾기',
    prompts: [
      '토리든 다이브인 저분자 히알루론산 세럼보다 저렴한 대체품 찾아줘',
      '클리오 킬브로우 오토 하드 브로우 펜슬보다 저렴한 대체품 찾아줘',
      '바닐라코 클린 잇 제로 오리지널 클렌징밤보다 저렴한 대체품 찾아줘',
    ],
  },
} as const;

type PromptGroupId = keyof typeof promptGroups;

type ChatQuickActionsProps = Readonly<{
  onProviderToggle: (providerId: RetailerId) => void;
  providerIds: ReadonlyArray<RetailerId>;
  setText: (text: string) => void;
}>;

export const ChatQuickActions = ({
  onProviderToggle,
  providerIds,
  setText,
}: ChatQuickActionsProps) => {
  const [activePromptGroup, setActivePromptGroup] = useState<PromptGroupId | null>(null);
  const group = activePromptGroup ? promptGroups[activePromptGroup] : null;
  const close = (): void => setActivePromptGroup(null);
  const selectPrompt = (prompt: string): void => {
    close();
    setText(prompt);
  };
  const toggleProvider = (providerId: RetailerId): void => {
    if (providerId === 'oliveyoung') {
      Alert.alert(
        '올리브영 검색을 사용할 수 없어요',
        '현재 올리브영 연동 서비스 문제로 상품 검색을 사용할 수 없습니다. 복구 전까지 다이소를 이용해 주세요.',
        [{ text: '확인' }],
      );
      return;
    }
    onProviderToggle(providerId);
  };

  return (
    <View style={styles.root} testID="chat-quick-actions">
      <ScrollView
        contentContainerStyle={styles.actions}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {retailerActions.map(({ id, label }) => {
          const selected = providerIds.includes(id);
          return (
            <Pressable
              accessibilityHint={
                id === 'oliveyoung' ? '현재 이용 불가 안내를 엽니다' : undefined
              }
              accessibilityLabel={`${label} 판매처 선택`}
              accessibilityRole="switch"
              accessibilityState={{ checked: selected }}
              key={id}
              onPress={() => toggleProvider(id)}
              style={styles.action(selected)}
            >
              <Text allowFontScaling style={styles.actionLabel(selected)}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        {(Object.keys(promptGroups) as Array<PromptGroupId>).map((id) => {
          const { label } = promptGroups[id];
          return (
            <Pressable
              accessibilityLabel={`${label} 프롬프트 열기`}
              accessibilityRole="button"
              key={id}
              onPress={() => setActivePromptGroup(id)}
              style={styles.action(false)}
            >
              <Text allowFontScaling style={styles.actionLabel(false)}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="overFullScreen"
        transparent
        visible={group !== null}
      >
        <View style={styles.sheetRoot}>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={close}
            style={styles.sheetBackdrop}
            testID="quick-actions-sheet-backdrop"
          />
          <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {group ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text
                    allowFontScaling
                    maxFontSizeMultiplier={2.5}
                    style={styles.sheetTitle}
                  >
                    {group.label}
                  </Text>
                  <Pressable
                    accessibilityLabel={`${group.label} 닫기`}
                    accessibilityRole="button"
                    onPress={close}
                    style={styles.sheetClose}
                  >
                    <Text allowFontScaling style={styles.sheetCloseLabel}>
                      닫기
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={styles.sheetContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.sheetScroll}
                >
                  {group.prompts.map((prompt) => (
                    <Pressable
                      accessibilityLabel={`프롬프트 선택: ${prompt}`}
                      accessibilityRole="button"
                      key={prompt}
                      onPress={() => selectPrompt(prompt)}
                      style={styles.prompt}
                    >
                      <Text
                        allowFontScaling
                        maxFontSizeMultiplier={2.5}
                        style={styles.promptLabel}
                      >
                        {prompt}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { marginHorizontal: -theme.spacing.md },
  actions: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  action: (selected: boolean) => ({
    alignItems: 'center',
    backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: selected ? 0 : 1,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
  }),
  actionLabel: (selected: boolean) => ({
    color: selected ? theme.colors.primaryText : theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  }),
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.scrim,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxHeight: theme.layout.conversationSheet.maxHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.textMuted,
    borderRadius: theme.radii.pill,
    height: theme.spacing.xs,
    width: theme.layout.conversationSheet.handleWidth,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '600' },
  sheetClose: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    minWidth: theme.interaction.minTouchTarget,
  },
  sheetCloseLabel: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
  prompt: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    minHeight: theme.interaction.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  promptLabel: { color: theme.colors.text, fontSize: 16, lineHeight: 23 },
}));
