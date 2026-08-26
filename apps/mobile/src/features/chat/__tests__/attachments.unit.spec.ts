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

const mockSuccessfulSelection = (): void => {
  mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({
    canAskAgain: true,
    expires: 'never',
    granted: true,
    status: ImagePicker.PermissionStatus.GRANTED,
  });
  mockedLaunchImageLibraryAsync.mockResolvedValue({
    assets: [selectedAsset],
    canceled: false,
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
    jest.restoreAllMocks();
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
});
