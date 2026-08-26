import { Screen, SectionTitle } from '@shopport/ui';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { kakaoAccountEmail, useSession } from '@/features/auth';
import { useProfile } from '@/features/profile';
import { useOnline } from '@/providers/network-provider';
import { environment } from '@/shared/config/environment';
import { GlassActionButton } from '@/shared/ui/glass-button';

export const SettingsScreen = () => {
  const { status } = useSession();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return <SettingsContent />;
};

const SettingsContent = () => {
  const { logout, status } = useSession();
  const online = useOnline();
  const remoteEnabled = status === 'authenticated' && online;
  const { deleteAccount, displayName, updateDisplayName, updating } = useProfile();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState<string | null | undefined>();

  useEffect(() => {
    if (displayName) setNickname(displayName);
  }, [displayName]);

  useEffect(() => {
    if (!remoteEnabled) return;
    let active = true;
    void kakaoAccountEmail()
      .then((accountEmail) => {
        if (active) setEmail(accountEmail);
      })
      .catch(() => {
        if (active) setEmail(null);
      });
    return () => {
      active = false;
    };
  }, [remoteEnabled]);

  const trimmedNickname = nickname.trim();
  const nicknameUnchanged = trimmedNickname === displayName;
  const saveNicknameDisabled =
    !remoteEnabled ||
    !trimmedNickname ||
    trimmedNickname.length > 30 ||
    nicknameUnchanged;

  const saveNickname = async (): Promise<void> => {
    const error = await updateDisplayName(trimmedNickname);
    if (error) Alert.alert('닉네임을 변경하지 못했어요', error);
  };

  const openPrivacyPolicy = (): void => {
    if (!environment.privacyPolicyUrl) {
      Alert.alert(
        '개인정보 처리방침을 열 수 없어요',
        '개인정보 처리방침 URL이 설정되지 않았습니다.',
      );
      return;
    }
    void Linking.openURL(environment.privacyPolicyUrl).catch(() => {
      Alert.alert('개인정보 처리방침을 열 수 없어요', '다시 시도해 주세요.');
    });
  };

  const deleteViewer = async (): Promise<void> => {
    const error = await deleteAccount();
    if (error) {
      Alert.alert('삭제 실패', error);
      return;
    }
    await logout();
    router.replace('/auth');
  };

  const confirmDelete = (): void => {
    if (!remoteEnabled) {
      Alert.alert('오프라인', '계정 삭제는 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.alert(
      '회원 탈퇴를 진행할까요?',
      '접근은 즉시 차단됩니다. 대화, 찜, 이미지 데이터는 비동기로 삭제되며 백업은 최대 35일 뒤 만료됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '회원 탈퇴',
          style: 'destructive',
          onPress: () => void deleteViewer(),
        },
      ],
    );
  };

  return (
    <Screen testID="settings-screen">
      <ScrollView contentContainerStyle={styles.root}>
        <SectionTitle>설정</SectionTitle>
        <View style={styles.section}>
          <Text allowFontScaling style={styles.label}>
            닉네임
          </Text>
          <TextInput
            accessibilityLabel="닉네임"
            autoCorrect={false}
            maxLength={30}
            onChangeText={setNickname}
            onSubmitEditing={() => {
              if (!saveNicknameDisabled && !updating) void saveNickname();
            }}
            placeholder="닉네임을 입력하세요"
            placeholderTextColor={styles.placeholder.color}
            returnKeyType="done"
            style={styles.input}
            value={nickname}
          />
          <Text allowFontScaling style={styles.hint}>
            1자 이상 30자 이하
          </Text>
          <GlassActionButton
            disabled={saveNicknameDisabled}
            loading={updating}
            onPress={() => void saveNickname()}
            variant="secondary"
          >
            닉네임 저장
          </GlassActionButton>
        </View>
        <View style={styles.section}>
          <Text allowFontScaling style={styles.label}>
            이메일
          </Text>
          <Text allowFontScaling selectable style={styles.value}>
            {email === undefined
              ? '이메일 확인 중'
              : (email ?? '카카오에서 제공되지 않음')}
          </Text>
        </View>
        <GlassActionButton onPress={openPrivacyPolicy} variant="secondary">
          개인정보 처리방침
        </GlassActionButton>
        <GlassActionButton
          onPress={() =>
            void logout().catch(() => {
              Alert.alert('로그아웃 실패', '다시 시도해 주세요.');
            })
          }
          variant="secondary"
        >
          로그아웃
        </GlassActionButton>
        <GlassActionButton onPress={confirmDelete} variant="danger">
          회원 탈퇴
        </GlassActionButton>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.spacing.lg, padding: theme.spacing.xl },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  label: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  input: {
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
  },
  placeholder: { color: theme.colors.textMuted },
  hint: { color: theme.colors.textMuted, fontSize: 13 },
  value: { color: theme.colors.text, fontSize: 16, lineHeight: 23 },
}));
