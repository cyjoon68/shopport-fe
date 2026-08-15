import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import type { Attachment } from './chat-composer-types';
import { styles } from './chat-composer-styles';

type Props = Readonly<{
  allowFreeText: boolean;
  attach: () => Promise<void>;
  draftReady: boolean;
  loading: boolean;
  online: boolean;
  onStop: () => Promise<void>;
  remove: () => Promise<void>;
  send: () => Promise<void>;
  sendDisabled: boolean;
  setText: (text: string) => void;
  text: string;
  uploading: boolean;
  verifyAsset: (asset: Attachment) => Promise<void>;
  asset: Attachment | null;
}>;

export const ChatComposerView = ({
  allowFreeText,
  asset,
  attach,
  draftReady,
  loading,
  online,
  onStop,
  remove,
  send,
  sendDisabled,
  setText,
  text,
  uploading,
  verifyAsset,
}: Props) => (
  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {!online ? (
      <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.offline}>
        오프라인 · 초안은 이 기기에 저장됩니다
      </Text>
    ) : null}
    {!draftReady ? (
      <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.draftStatus}>
        초안을 불러오는 중입니다
      </Text>
    ) : null}
    {asset ? (
      <View style={styles.attachment}>
        <Image
          accessibilityLabel="첨부한 상품 사진"
          contentFit="cover"
          source={asset.uri}
          style={styles.thumbnail}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void remove()}
          style={styles.removeButton}
        >
          <Text allowFontScaling style={styles.removeLabel}>
            이미지 제거
          </Text>
        </Pressable>
        {asset.state !== 'ready' ? (
          <View style={styles.assetStatus}>
            <Text
              accessibilityLiveRegion="polite"
              allowFontScaling
              style={styles.statusLabel}
            >
              {asset.state === 'timeout'
                ? '처리 확인 시간이 초과되었습니다'
                : '이미지 처리 중'}
            </Text>
            {asset.state === 'timeout' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void verifyAsset(asset)}
                style={styles.retryButton}
              >
                <Text allowFontScaling style={styles.retryLabel}>
                  상태 다시 확인
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null}
    <View style={styles.root}>
      <Pressable
        accessibilityLabel="이미지 첨부"
        accessibilityRole="button"
        disabled={loading || uploading || !draftReady || !allowFreeText}
        hitSlop={4}
        onPress={() => void attach()}
        style={styles.iconButton}
      >
        <Text allowFontScaling maxFontSizeMultiplier={2} style={styles.iconLabel}>
          {uploading ? '첨부 중' : '첨부'}
        </Text>
      </Pressable>
      <TextInput
        accessibilityLabel="쇼핑 질문"
        editable={!loading && draftReady && allowFreeText}
        maxLength={2_000}
        multiline
        blurOnSubmit={false}
        onChangeText={setText}
        placeholder="원하는 상품과 조건을 알려주세요"
        placeholderTextColor={styles.placeholder.color}
        returnKeyType="default"
        scrollEnabled
        style={styles.input}
        value={text}
      />
      <Pressable
        accessibilityLabel={loading ? '응답 중지' : '메시지 보내기'}
        accessibilityRole="button"
        accessibilityState={{ disabled: sendDisabled }}
        disabled={sendDisabled}
        onPress={() => void (loading ? onStop() : send())}
        style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
      >
        <Text allowFontScaling style={styles.sendLabel}>
          {loading ? '중지' : '전송'}
        </Text>
      </Pressable>
    </View>
  </KeyboardAvoidingView>
);
