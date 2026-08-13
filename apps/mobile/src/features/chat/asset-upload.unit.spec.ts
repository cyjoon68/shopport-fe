import { apolloClient } from '@/providers/apollo-client';
import { removeUploadedAsset } from './asset-upload';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('@/providers/apollo-client', () => ({
  apolloClient: { mutate: jest.fn() },
}));

const mockedMutate = apolloClient.mutate as jest.MockedFunction<
  typeof apolloClient.mutate
>;

describe('asset deletion payload validation', () => {
  beforeEach(() => mockedMutate.mockReset());

  it('resolves only when the delete payload explicitly succeeds', async () => {
    mockedMutate.mockResolvedValue({
      data: { deleteAsset: { success: true, userErrors: [] } },
    });

    await expect(removeUploadedAsset('asset-1')).resolves.toBeUndefined();
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
});
