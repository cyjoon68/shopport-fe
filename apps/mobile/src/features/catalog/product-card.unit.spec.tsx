import { fireEvent, render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Pressable as mockPressable,
  Text as mockNativeText,
} from 'react-native';
import { useMutation } from '@apollo/client/react';
import type { CachedProduct } from '@/shared/storage/database';
import { ProductCard } from './product-card';

const product = {
  id: 'product-1',
  title: '텀블러',
  imageUrl: 'https://example.com/product.jpg',
  providerId: 'provider-1',
  providerName: '판매처',
  amountMinor: '10000',
  shippingMinor: '0',
  totalMinor: '10000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  outboundUrl: 'https://example.com/product',
  deliveryExpectedAt: null,
  observedAt: '2026-08-13T00:00:00.000Z',
  isSaved: false,
} satisfies CachedProduct;

let mockOnline = true;

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(() => [jest.fn(), {}]),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => mockOnline,
}));

jest.mock('@/features/catalog/compare-provider', () => ({
  useCompare: () => ({ add: () => 'duplicate' }),
}));

jest.mock('@/shared/accessibility/use-reduced-motion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/ui/glass-button', () => ({
  GlassButton: ({
    accessibilityHint,
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityHint?: string;
    accessibilityLabel?: string;
    children: ReactNode;
    onPress?: () => void;
  }) =>
    mockCreateElement(
      mockPressable,
      { accessibilityHint, accessibilityLabel, onPress },
      children,
    ),
}));

jest.mock('expo-image', () => ({
  Image: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
    mockCreateElement(mockNativeText, { accessibilityLabel }, 'image'),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

describe('product card links', () => {
  beforeEach(() => {
    mockOnline = true;
    jest.clearAllMocks();
    mockedUseMutation.mockReturnValue([
      jest.fn(),
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the validated external link', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    expect(openURL).toHaveBeenCalledWith('https://example.com/product');
  });

  it('blocks non-https links', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(
      <ProductCard product={{ ...product, outboundUrl: 'http://example.com/product' }} />,
    );

    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    expect(openURL).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      '안전하지 않은 링크',
      '구매 링크를 열 수 없습니다.',
    );
  });
});
