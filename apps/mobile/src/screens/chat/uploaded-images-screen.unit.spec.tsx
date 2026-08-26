import { render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { Text as mockText, View as mockView } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import { useUploadedImages } from '@/features/chat/api/hooks';

import { UploadedImagesScreen } from './uploaded-images-screen';

let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: mockStatus }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => mockOnline,
}));

jest.mock('@/features/chat/api/hooks', () => ({
  useUploadedImages: jest.fn(() => ({ images: [], loadMore: jest.fn() })),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: () => mockCreateElement(mockText, { testID: 'image-list' }, 'images'),
}));

jest.mock('@shopport/ui', () => ({
  EmptyState: () => null,
  Screen: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    mockCreateElement(mockView, { testID }, children),
}));

const mockedUseUploadedImages = jest.mocked(useUploadedImages);

describe('uploaded images screen session policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
  });

  it('does not mount image cache or query hooks while booting', () => {
    mockStatus = 'booting';
    const screen = render(<UploadedImagesScreen />);

    expect(screen.queryByTestId('uploaded-images-screen')).toBeNull();
    expect(mockedUseUploadedImages).not.toHaveBeenCalled();
  });

  it('redirects guests before image hooks mount', () => {
    mockStatus = 'guest';
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseUploadedImages).not.toHaveBeenCalled();
  });

  it('enables remote image reads for online authenticated sessions', () => {
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('image-list')).toBeOnTheScreen();
    expect(mockedUseUploadedImages).toHaveBeenCalledWith(true);
  });

  it('renders the offline cache-only surface with remote image reads disabled', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('image-list')).toBeOnTheScreen();
    expect(
      screen.getByText('오프라인에서는 업로드한 이미지를 불러올 수 없습니다.'),
    ).toBeOnTheScreen();
    expect(mockedUseUploadedImages).toHaveBeenCalledWith(false);
  });
});
