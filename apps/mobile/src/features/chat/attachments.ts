import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { createAssetUpload, removeUploadedAsset } from './api/fetchers';
import type { UploadedAsset } from './types';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const maxBytes = 15 * 1024 * 1024;
const maxPixels = 20_000_000;
const uploadTimeoutMilliseconds = 60_000;

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
  const selected = result.assets?.[0];
  if (!selected) return null;
  if (!selected.uri.trim()) throw new Error('이미지 파일을 찾을 수 없습니다.');
  if (
    typeof selected.fileSize !== 'number' ||
    !Number.isFinite(selected.fileSize) ||
    selected.fileSize <= 0 ||
    selected.fileSize > maxBytes
  ) {
    throw new Error('이미지는 15MB 이하여야 합니다.');
  }
  if (
    !Number.isFinite(selected.width) ||
    selected.width <= 0 ||
    !Number.isFinite(selected.height) ||
    selected.height <= 0 ||
    selected.width * selected.height > maxPixels
  ) {
    throw new Error('이미지는 20MP 이하여야 합니다.');
  }
  const contentType = selected.mimeType?.toLowerCase() ?? '';
  if (!allowedMimeTypes.has(contentType)) {
    throw new Error('JPEG, PNG, HEIC 이미지만 사용할 수 있습니다.');
  }
  const upload = await createAssetUpload(
    conversationId,
    contentType,
    String(selected.fileSize),
  );
  const controller = new AbortController();
  const nativeUploadPromise = new File(selected.uri).upload(upload.uploadUrl, {
    httpMethod: 'PUT',
    headers: Object.fromEntries(upload.headers.map(({ name, value }) => [name, value])),
    mimeType: contentType,
    signal: controller.signal,
  });
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('upload timeout'));
    }, uploadTimeoutMilliseconds);
  });
  let uploaded = false;
  try {
    const uploadResult = await Promise.race([nativeUploadPromise, timeoutPromise]);
    uploaded = uploadResult.status >= 200 && uploadResult.status < 300;
  } catch {
    uploaded = false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!uploaded) {
    let primaryCleanupPromise = Promise.resolve();
    if (timedOut)
      void nativeUploadPromise.then(
        async () => {
          await primaryCleanupPromise;
          await bestEffortRemoveUploadedAsset(upload.asset.id);
        },
        () => undefined,
      );
    primaryCleanupPromise = bestEffortRemoveUploadedAsset(upload.asset.id);
    await primaryCleanupPromise;
    throw new Error('이미지를 업로드하지 못했습니다.');
  }
  return { id: upload.asset.id, uri: selected.uri };
};

const bestEffortRemoveUploadedAsset = async (id: string): Promise<void> => {
  try {
    await removeUploadedAsset(id);
  } catch {
    return;
  }
};
