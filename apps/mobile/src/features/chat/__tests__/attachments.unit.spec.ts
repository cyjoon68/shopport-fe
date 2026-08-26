import { File, type UploadOptions, type UploadResult } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { apolloClient } from '@/providers/apollo-client';

import { removeUploadedAsset } from '../api/fetchers';
import { selectAndUploadAsset } from '../attachments';

jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({ File: jest.fn() }));

jest.mock('@/providers/apollo-client', () => ({
  apolloClient: { mutate: jest.fn() },
}));

const mockedMutate = apolloClient.mutate as jest.MockedFunction<
  typeof apolloClient.mutate
>;
const mockedRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
    typeof ImagePicker.requestMediaLibraryPermissionsAsync
  >;
const mockedLaunchImageLibraryAsync =
  ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
    typeof ImagePicker.launchImageLibraryAsync
  >;
const mockedFile = File as jest.MockedClass<typeof File>;
const mockUpload = jest.fn<Promise<UploadResult>, [string, UploadOptions?]>();

const selectedAsset = {
  fileSize: 128,
  height: 10,
  mimeType: 'image/png',
  uri: 'file://selected.png',
  width: 10,
};

const mockSelection = (asset: unknown = selectedAsset): void => {
  mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({
    canAskAgain: true,
    expires: 'never',
    granted: true,
    status: ImagePicker.PermissionStatus.GRANTED,
  });
  mockedLaunchImageLibraryAsync.mockResolvedValue({
    assets: asset === null ? [] : [asset],
    canceled: false,
  } as never);
};

const mockSuccessfulSelection = (): void => mockSelection();

const mockUploadCreation = (id = 'asset-1'): void => {
  mockedMutate.mockResolvedValueOnce({
    data: {
      createAssetUpload: {
        upload: {
          asset: { id },
          headers: [],
          uploadUrl: `https://upload.example/${id}`,
        },
        userErrors: [],
      },
    },
  });
};

const mockPutFailure = (): void => {
  mockUpload.mockResolvedValue({ body: '', headers: {}, status: 500 });
};

describe('asset deletion payload validation', () => {
  beforeEach(() => {
    mockedMutate.mockReset();
    mockedRequestMediaLibraryPermissionsAsync.mockReset();
    mockedLaunchImageLibraryAsync.mockReset();
    mockedFile.mockReset();
    mockUpload.mockReset();
    mockedFile.mockImplementation(() => ({ upload: mockUpload }) as unknown as File);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('fails before opening the picker when media permission is denied', async () => {
    mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({
      canAskAgain: false,
      expires: 'never',
      granted: false,
      status: 'denied',
    } as never);

    await expect(selectAndUploadAsset('conversation-1')).rejects.toThrow(
      '사진 접근 권한이 필요합니다.',
    );
    expect(mockedLaunchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockedMutate).not.toHaveBeenCalled();
  });

  it('returns null when image selection is canceled', async () => {
    mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({
      canAskAgain: true,
      expires: 'never',
      granted: true,
      status: ImagePicker.PermissionStatus.GRANTED,
    });
    mockedLaunchImageLibraryAsync.mockResolvedValue({ assets: null, canceled: true });

    await expect(selectAndUploadAsset('conversation-1')).resolves.toBeNull();
    expect(mockedMutate).not.toHaveBeenCalled();
  });

  it('returns null when the picker reports an empty selection', async () => {
    mockSelection(null);

    await expect(selectAndUploadAsset('conversation-1')).resolves.toBeNull();
    expect(mockedMutate).not.toHaveBeenCalled();
  });

  it('returns null when a non-canceled picker result has no assets array', async () => {
    mockSelection();
    mockedLaunchImageLibraryAsync.mockResolvedValue({
      assets: null,
      canceled: false,
    } as never);

    await expect(selectAndUploadAsset('conversation-1')).resolves.toBeNull();
    expect(mockedMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing URI', { ...selectedAsset, uri: '' }, '이미지 파일을 찾을 수 없습니다.'],
    [
      'a missing size',
      { ...selectedAsset, fileSize: undefined },
      '이미지는 15MB 이하여야 합니다.',
    ],
    [
      'an empty file',
      { ...selectedAsset, fileSize: 0 },
      '이미지는 15MB 이하여야 합니다.',
    ],
    [
      'an oversized file',
      { ...selectedAsset, fileSize: 15 * 1024 * 1024 + 1 },
      '이미지는 15MB 이하여야 합니다.',
    ],
    [
      'an oversized pixel count',
      { ...selectedAsset, height: 4_001, width: 5_000 },
      '이미지는 20MP 이하여야 합니다.',
    ],
    [
      'missing dimensions',
      { ...selectedAsset, height: undefined, width: undefined },
      '이미지는 20MP 이하여야 합니다.',
    ],
    [
      'an unsupported MIME type',
      { ...selectedAsset, mimeType: 'image/gif' },
      'JPEG, PNG, HEIC 이미지만 사용할 수 있습니다.',
    ],
  ])('rejects picker metadata with %s', async (_case, asset, message) => {
    mockSelection(asset);

    await expect(selectAndUploadAsset('conversation-1')).rejects.toThrow(message);
    expect(mockedMutate).not.toHaveBeenCalled();
    expect(mockedFile).not.toHaveBeenCalled();
  });

  it('normalizes an allowed MIME type before creating and streaming the upload', async () => {
    mockSelection({ ...selectedAsset, mimeType: 'IMAGE/PNG' });
    mockUpload.mockResolvedValue({ body: '', headers: {}, status: 200 });
    mockUploadCreation('asset-normalized');

    await expect(selectAndUploadAsset('conversation-1')).resolves.toEqual({
      id: 'asset-normalized',
      uri: selectedAsset.uri,
    });

    expect(mockedMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            byteSize: '128',
            contentType: 'image/png',
            conversationId: 'conversation-1',
          },
        },
      }),
    );
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('resolves only when the delete payload explicitly succeeds', async () => {
    mockedMutate.mockResolvedValue({
      data: { deleteAsset: { success: true, userErrors: [] } },
    });

    await expect(removeUploadedAsset('asset-1')).resolves.toBeUndefined();
  });

  it('streams the selected file through the native uploader', async () => {
    mockSuccessfulSelection();
    mockUpload.mockResolvedValue({ body: '', headers: {}, status: 200 });
    mockedMutate.mockResolvedValue({
      data: {
        createAssetUpload: {
          upload: {
            asset: { id: 'asset-streamed' },
            headers: [
              { name: 'content-type', value: 'image/png' },
              { name: 'if-none-match', value: '*' },
            ],
            uploadUrl: 'https://upload.example/asset-streamed',
          },
          userErrors: [],
        },
      },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(selectAndUploadAsset('conversation-1')).resolves.toEqual({
      id: 'asset-streamed',
      uri: selectedAsset.uri,
    });

    expect(mockedFile).toHaveBeenCalledWith(selectedAsset.uri);
    expect(mockUpload).toHaveBeenCalledWith(
      'https://upload.example/asset-streamed',
      expect.objectContaining({
        headers: { 'content-type': 'image/png', 'if-none-match': '*' },
        httpMethod: 'PUT',
      }),
    );
    const uploadOptions = mockUpload.mock.calls[0]?.[1];
    expect(uploadOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws the first GraphQL user error when deletion reports failure', async () => {
    mockedMutate.mockResolvedValue({
      data: {
        deleteAsset: {
          success: false,
          userErrors: [{ message: '이미지가 이미 삭제되었습니다.' }],
        },
      },
    });

    await expect(removeUploadedAsset('asset-1')).rejects.toThrow(
      '이미지가 이미 삭제되었습니다.',
    );
  });

  it('throws a safe default when the delete payload is missing', async () => {
    mockedMutate.mockResolvedValue({ data: null });

    await expect(removeUploadedAsset('asset-1')).rejects.toThrow(
      '이미지를 삭제하지 못했습니다.',
    );
  });

  it('throws a safe default when a failed payload has no user errors', async () => {
    mockedMutate.mockResolvedValue({
      data: { deleteAsset: { success: false, userErrors: undefined } },
    });

    await expect(removeUploadedAsset('asset-1')).rejects.toThrow(
      '이미지를 삭제하지 못했습니다.',
    );
  });

  it('preserves the PUT failure when best-effort cleanup rejects', async () => {
    mockSuccessfulSelection();
    mockPutFailure();
    mockedMutate
      .mockResolvedValueOnce({
        data: {
          createAssetUpload: {
            upload: {
              asset: { id: 'asset-1' },
              headers: [],
              uploadUrl: 'https://upload.example/asset-1',
            },
            userErrors: [],
          },
        },
      })
      .mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(selectAndUploadAsset('conversation-1')).rejects.toThrow(
      '이미지를 업로드하지 못했습니다.',
    );
    expect(mockedMutate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ variables: { input: { id: 'asset-1' } } }),
    );
  });

  it('preserves the PUT failure when cleanup reports GraphQL failure', async () => {
    mockSuccessfulSelection();
    mockPutFailure();
    mockedMutate
      .mockResolvedValueOnce({
        data: {
          createAssetUpload: {
            upload: {
              asset: { id: 'asset-2' },
              headers: [],
              uploadUrl: 'https://upload.example/asset-2',
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deleteAsset: {
            success: false,
            userErrors: [{ message: 'cleanup rejected' }],
          },
        },
      });

    await expect(selectAndUploadAsset('conversation-1')).rejects.toThrow(
      '이미지를 업로드하지 못했습니다.',
    );
  });

  it('times out an uploader that ignores abort and cleans up the allocated asset', async () => {
    jest.useFakeTimers();
    mockSuccessfulSelection();
    let rejectUpload!: (error: Error) => void;
    mockUpload.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    mockUploadCreation('asset-timeout');
    mockedMutate.mockRejectedValueOnce(new Error('cleanup unavailable'));

    const selection = selectAndUploadAsset('conversation-1');
    const outcome = selection.then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : 'unknown error'),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const signal = mockUpload.mock.calls[0]?.[1]?.signal;

    await jest.advanceTimersByTimeAsync(60_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe(
      '이미지를 업로드하지 못했습니다.',
    );
    expect(signal?.aborted).toBe(true);
    expect(mockedMutate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ variables: { input: { id: 'asset-timeout' } } }),
    );
    expect(jest.getTimerCount()).toBe(0);

    rejectUpload(new Error('late native rejection'));
    await Promise.resolve();
    await Promise.resolve();
  });

  it('clears the upload timer and leaves its controller inactive after success', async () => {
    jest.useFakeTimers();
    mockSuccessfulSelection();
    mockUpload.mockResolvedValue({ body: '', headers: {}, status: 200 });
    mockUploadCreation('asset-success');

    await expect(selectAndUploadAsset('conversation-1')).resolves.toEqual({
      id: 'asset-success',
      uri: selectedAsset.uri,
    });
    const signal = mockUpload.mock.calls[0]?.[1]?.signal;

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(signal?.aborted).toBe(false);
  });

  it('cleans up an allocated asset when the native uploader rejects', async () => {
    mockSuccessfulSelection();
    mockUpload.mockRejectedValue(new Error('native upload failed'));
    mockUploadCreation('asset-rejected');
    mockedMutate.mockResolvedValueOnce({
      data: { deleteAsset: { success: true, userErrors: [] } },
    });

    await expect(selectAndUploadAsset('conversation-1')).rejects.toThrow(
      '이미지를 업로드하지 못했습니다.',
    );
    expect(mockedMutate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ variables: { input: { id: 'asset-rejected' } } }),
    );
  });
});
