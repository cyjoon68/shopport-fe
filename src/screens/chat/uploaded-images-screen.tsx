import { FlashList } from '@shopify/flash-list';
import { EmptyState, Screen } from '@shopport/ui';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import { useUploadedImages } from '@/features/chat/api/hooks';
import type { UploadedImage } from '@/features/chat/types';
import { useOnline } from '@/providers/network-provider';
const imageKey = ({ id }: UploadedImage): string => id;
const renderImage = ({ item }: Readonly<{ item: UploadedImage }>) => (
  <View style={styles.imageCell}>
    <Image
      accessibilityLabel="업로드한 이미지"
      contentFit="cover"
      source={item.url}
      style={styles.image}
    />
  </View>
);

export const UploadedImagesScreen = () => {
  const { status } = useSession();
  const networkOnline = useOnline();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return <UploadedImagesContent online={status === 'authenticated' && networkOnline} />;
};

const UploadedImagesContent = ({ online }: Readonly<{ online: boolean }>) => {
  const { images, loadMore } = useUploadedImages(online);

  return (
    <Screen testID="uploaded-images-screen">
      {!online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인에서는 업로드한 이미지를 불러올 수 없습니다.
        </Text>
      ) : null}
      <FlashList
        contentContainerStyle={styles.list}
        data={images}
        keyExtractor={imageKey}
        ListEmptyComponent={
          <EmptyState
            description="대화에 첨부한 이미지가 여기에 모입니다."
            title="업로드한 이미지가 없습니다"
          />
        }
        numColumns={3}
        onEndReached={() => void loadMore().catch(() => undefined)}
        renderItem={renderImage}
      />
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  list: { gap: theme.spacing.sm, padding: theme.spacing.lg },
  imageCell: {
    aspectRatio: 1,
    borderRadius: theme.radii.md,
    flex: 1,
    margin: theme.spacing.xs,
    overflow: 'hidden',
  },
  image: { height: '100%', width: '100%' },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
}));
