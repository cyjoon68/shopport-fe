import { useQuery } from '@apollo/client/react';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Screen } from '@shopport/ui';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth/session-provider';
import { UploadedImagesDocument } from '@/graphql/generated/graphql';
import { useOnline } from '@/providers/network-provider';

export const UploadedImagesScreen = () => {
  const { status } = useSession();
  const online = useOnline();
  const { data, fetchMore } = useQuery(UploadedImagesDocument, {
    variables: { first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: status !== 'authenticated' || !online,
  });
  const results =
    data?.conversations.edges.flatMap(({ node }) =>
      node.messages.flatMap(({ parts }) =>
        parts.flatMap((part) =>
          part.__typename === 'ImageMessagePart' && part.asset.url
            ? [{ id: part.asset.id, url: part.asset.url }]
            : [],
        ),
      ),
    ) ?? [];
  const images = [...new Map(results.map((image) => [image.id, image])).values()];

  if (status === 'guest') return <Redirect href="/auth" />;

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
        keyExtractor={({ id }) => id}
        ListEmptyComponent={
          <EmptyState
            description="대화에 첨부한 이미지가 여기에 모입니다."
            title="업로드한 이미지가 없습니다"
          />
        }
        numColumns={3}
        onEndReached={() => {
          const pageInfo = data?.conversations.pageInfo;
          if (pageInfo?.hasNextPage)
            void fetchMore({ variables: { after: pageInfo.endCursor, first: 20 } });
        }}
        renderItem={({ item }) => (
          <View style={styles.imageCell}>
            <Image
              accessibilityLabel="업로드한 이미지"
              contentFit="cover"
              source={item.url}
              style={styles.image}
            />
          </View>
        )}
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
