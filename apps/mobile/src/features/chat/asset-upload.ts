import * as ImagePicker from 'expo-image-picker';
import { apolloClient } from '@/providers/apollo-client';
import {
  CreateAssetUploadDocument,
  DeleteAssetDocument,
} from '@/graphql/generated/graphql';

export type UploadedAsset = Readonly<{ id: string; uri: string }>;

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const maxBytes = 15 * 1024 * 1024;
const maxPixels = 20_000_000;

export const selectAndUploadAsset = async (
  conversationId: string,
): Promise<UploadedAsset | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('사진 접근 권한이 필요합니다.');
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    mediaTypes: ['images'],
    quality: 1,
    selectionLimit: 1,
  });
  if (result.canceled) return null;
  const selected = result.assets[0];
  if (!selected) return null;
  if (!selected.fileSize || selected.fileSize > maxBytes) {
    throw new Error('이미지는 15MB 이하여야 합니다.');
  }
  if (selected.width * selected.height > maxPixels) {
    throw new Error('이미지는 20MP 이하여야 합니다.');
  }
  const contentType = selected.mimeType?.toLowerCase() ?? '';
  if (!allowedMimeTypes.has(contentType)) {
    throw new Error('JPEG, PNG, HEIC 이미지만 사용할 수 있습니다.');
  }
  const response = await apolloClient.mutate({
    mutation: CreateAssetUploadDocument,
    variables: {
      input: {
        conversationId,
        contentType,
        byteSize: String(selected.fileSize),
      },
    },
  });
  const payload = response.data?.createAssetUpload;
  if (!payload?.upload) {
    throw new Error(
      payload?.userErrors[0]?.message ?? '이미지 업로드를 준비하지 못했습니다.',
    );
  }
  const blob = await (await fetch(selected.uri)).blob();
  const upload = await fetch(payload.upload.uploadUrl, {
    method: 'PUT',
    headers: Object.fromEntries(
      payload.upload.headers.map(({ name, value }) => [name, value]),
    ),
    body: blob,
  });
  if (!upload.ok) {
    await apolloClient.mutate({
      mutation: DeleteAssetDocument,
      variables: { input: { id: payload.upload.asset.id } },
    });
    throw new Error('이미지를 업로드하지 못했습니다.');
  }
  return { id: payload.upload.asset.id, uri: selected.uri };
};

export const removeUploadedAsset = async (id: string): Promise<void> => {
  await apolloClient.mutate({
    mutation: DeleteAssetDocument,
    variables: { input: { id } },
  });
};
