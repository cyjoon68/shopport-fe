import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { GlassButton } from '@/shared/ui/glass-button';

import type { ChatComposerViewProps } from '../../types';
import { NewChatFooter } from './new-chat-footer';
import { styles } from './styles';

export const ChatComposerView = ({
  allowFreeText,
  asset,
  attach,
  draftReady,
  loading,
  online,
  onStop,
  onProviderToggle,
  providerIds,
  quickActionsEnabled,
  remove,
  send,
  sendDisabled,
  setText,
  text,
  uploading,
  verifyAsset,
}: ChatComposerViewProps) => (
  <>
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
        <GlassButton onPress={() => void remove()} style={styles.removeButton}>
          <Text allowFontScaling style={styles.removeLabel}>
            이미지 제거
          </Text>
        </GlassButton>
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
              <GlassButton
                onPress={() => void verifyAsset(asset)}
                style={styles.retryButton}
              >
                <Text allowFontScaling style={styles.retryLabel}>
                  상태 다시 확인
                </Text>
              </GlassButton>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null}
    <NewChatFooter
      attachDisabled={loading || uploading || !draftReady || !allowFreeText}
      inputEditable={!loading && draftReady && allowFreeText}
      loading={loading}
      onAttach={attach}
      onProviderToggle={onProviderToggle}
      onSend={send}
      onStop={onStop}
      providerIds={providerIds}
      quickActionsEnabled={quickActionsEnabled}
      sendDisabled={sendDisabled}
      setText={setText}
      text={text}
    />
  </>
);
