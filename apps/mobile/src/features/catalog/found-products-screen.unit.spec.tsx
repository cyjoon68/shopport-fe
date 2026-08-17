import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { FoundProductsContent } from './found-products-screen';

type FlashListProps = Readonly<{
  numColumns?: number;
}>;

let mockFlashListProps: FlashListProps | null = null;

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => ({ data: undefined, fetchMore: jest.fn() })),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: FlashListProps) => {
    mockFlashListProps = props;
    return null;
  },
}));

jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@shopport/ui', () => ({
  EmptyState: () => null,
  Screen: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('./product-card', () => ({
  ProductCard: () => null,
}));

describe('found products layout', () => {
  beforeEach(() => {
    mockFlashListProps = null;
  });

  it('renders products in a two-column grid', () => {
    render(<FoundProductsContent />);

    expect(mockFlashListProps?.numColumns).toBe(2);
  });
});
