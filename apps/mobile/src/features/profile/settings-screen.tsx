import { Alert, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useMutation, useQuery } from '@apollo/client/react';
import { Screen, SectionTitle } from '@shopport/ui';
import { DeleteViewerAccountDocument, ViewerDocument } from '@/graphql/generated/graphql';
import { useSession } from '@/features/auth/session-provider';
import { useOnline } from '@/providers/network-provider';
import { GlassActionButton } from '@/shared/ui/glass-button';

export const SettingsScreen = () => {
  const { logout, status } = useSession();
  const online = useOnline();
  const { data } = useQuery(ViewerDocument, { skip: status !== 'authenticated' });
  const [deleteAccount] = useMutation(DeleteViewerAccountDocument);
  if (status === 'guest') return <Redirect href="/auth" />;

  const confirmDelete = (): void => {
    if (!online) {
      Alert.alert('오프라인', '계정 삭제는 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.alert(
      '계정을 삭제할까요?',
      '접근은 즉시 차단됩니다. 대화, 찜, 이미지, 검색 문서는 비동기로 삭제되며 백업은 최대 35일 뒤 만료됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계정 삭제',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await deleteAccount();
              if (!result.data?.deleteViewerAccount.success) {
                Alert.alert(
                  '삭제 실패',
                  result.data?.deleteViewerAccount.userErrors[0]?.message ??
                    '다시 시도해 주세요.',
                );
                return;
              }
              await logout();
              router.replace('/auth');
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen testID="settings-screen">
      <ScrollView contentContainerStyle={styles.root}>
        <SectionTitle>설정</SectionTitle>
        <View style={styles.profile}>
          <Text allowFontScaling style={styles.name}>
            {data?.viewer.displayName ?? 'Shopport 사용자'}
          </Text>
          <Text allowFontScaling style={styles.detail}>
            한국 · KRW
          </Text>
        </View>
        <GlassActionButton onPress={() => router.push('/favorites')} variant="secondary">
          찜한 상품
        </GlassActionButton>
        <GlassActionButton
          onPress={() => router.push('/subscription')}
          variant="secondary"
        >
          구독 관리
        </GlassActionButton>
        <GlassActionButton onPress={() => void logout()} variant="secondary">
          로그아웃
        </GlassActionButton>
        <View style={styles.privacy}>
          <Text accessibilityRole="header" allowFontScaling style={styles.privacyTitle}>
            데이터 보관
          </Text>
          <Text allowFontScaling style={styles.detail}>
            최근 대화, 찜, 입력 초안은 이 기기에 제한 저장됩니다. 로그아웃과 계정 삭제 시
            제거됩니다.
          </Text>
        </View>
        <GlassActionButton onPress={confirmDelete} variant="danger">
          계정 삭제
        </GlassActionButton>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.spacing.xl, padding: theme.spacing.xl },
  profile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  name: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  detail: { color: theme.colors.textMuted, fontSize: 15, lineHeight: 23 },
  privacy: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
  },
  privacyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
}));
