import { useQuery } from '@apollo/client/react';
import { render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { Text as mockText, View as mockView } from 'react-native';

import type { SessionStatus } from '@/features/auth';

import { UploadedImagesScreen } from './uploaded-images-screen';

let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockEndReached: (() => void) | undefined;
const mockFetchMore = jest.fn();

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

jest.mock('@apollo/client/react', () => ({
  useApolloClient: jest.fn(),
  useMutation: jest.fn(),
  useQuery: jest.fn(() => ({
    data: {
      conversations: {
        edges: [],
        pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
      },
    },
    fetchMore: mockFetchMore,
  })),
}));

jest.mock(
  '@tanstack/ai-react',
  () => ({
    useChat: jest.fn(),
    xhrHttpStream: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('@/shared/storage', () => ({
  flushChatPersistence: jest.fn(),
  sqliteChatPersistence: {},
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ onEndReached }: { onEndReached: () => void }) => {
    mockEndReached = onEndReached;
    return mockCreateElement(mockText, { testID: 'image-list' }, 'images');
  },
}));

jest.mock('@/shared/components', () => ({
  EmptyState: () => null,
  Screen: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    mockCreateElement(mockView, { testID }, children),
}));

const mockedUseQuery = jest.mocked(useQuery);

describe('uploaded images screen session policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
    mockEndReached = undefined;
  });

  it('does not mount image cache or query hooks while booting', () => {
    mockStatus = 'booting';
    const screen = render(<UploadedImagesScreen />);

    expect(screen.queryByTestId('uploaded-images-screen')).toBeNull();
    expect(mockedUseQuery).not.toHaveBeenCalled();
  });

  it('redirects guests before image hooks mount', () => {
    mockStatus = 'guest';
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseQuery).not.toHaveBeenCalled();
  });

  it('enables remote image reads for online authenticated sessions', () => {
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('image-list')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: false }),
    );
  });

  it('renders the offline cache-only surface with remote image reads disabled', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;
    const screen = render(<UploadedImagesScreen />);

    expect(screen.getByTestId('image-list')).toBeOnTheScreen();
    expect(
      screen.getByText('오프라인에서는 업로드한 이미지를 불러올 수 없습니다.'),
    ).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    );
  });

  it('blocks a retained public end-reached callback after going offline', () => {
    const screen = render(<UploadedImagesScreen />);
    const retainedEndReached = mockEndReached;

    mockStatus = 'offline-authenticated';
    screen.rerender(<UploadedImagesScreen />);
    retainedEndReached?.();

    expect(mockFetchMore).not.toHaveBeenCalled();
  });

  it('consumes an expected pagination rejection from the list callback', async () => {
    mockFetchMore.mockRejectedValueOnce(new Error('pagination failed'));
    render(<UploadedImagesScreen />);

    mockEndReached?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });
});
