import { useMutation } from '@apollo/client/react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createElement as mockCreateElement } from 'react';
import {
  Alert,
  Linking,
  type StyleProp,
  Text as mockNativeText,
  type TextStyle,
} from 'react-native';

import type { CachedProduct } from '@/shared/storage/database';
import { cacheProducts } from '@/shared/storage/database';

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

jest.mock('@/shared/storage/database', () => ({
  cacheProducts: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/accessibility/use-reduced-motion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image', () => ({
  Image: ({
    accessibilityLabel,
    source,
    style,
  }: {
    accessibilityLabel?: string;
    source?: string;
    style?: unknown;
  }) =>
    mockCreateElement(
      mockNativeText,
      { accessibilityLabel, style: style as StyleProp<TextStyle>, testID: source },
      'image',
    ),
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

  it('saves a product and updates the action state', async () => {
    const saveProduct = jest.fn().mockResolvedValue({
      data: { saveProduct: { userErrors: [] } },
    });
    const mutationState = {
      called: false,
      client: {},
      loading: false,
      reset: jest.fn(),
    };
    mockedUseMutation.mockReset();
    mockedUseMutation.mockReturnValue([saveProduct, mutationState] as ReturnType<
      typeof useMutation
    >);
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 찜'));

    await waitFor(() => expect(screen.getByTestId('sf:bookmark.fill')).toBeOnTheScreen());
    expect(saveProduct).toHaveBeenCalledWith({
      variables: { input: { productId: 'product-1' } },
    });
    expect(jest.mocked(cacheProducts)).toHaveBeenCalledWith([
      { ...product, isSaved: true },
    ]);
  });

  it('uses a bookmark icon instead of a text label', () => {
    const screen = render(<ProductCard product={product} />);

    expect(screen.getByTestId('sf:bookmark')).toBeOnTheScreen();
    expect(screen.queryByText('찜')).not.toBeOnTheScreen();
  });

  it('renders a horizontal recommendation card with a 112pt image and compact round bookmark', () => {
    const screen = render(<ProductCard horizontal product={product} />);

    expect(screen.getByLabelText('텀블러 상품 이미지')).toHaveStyle({
      height: 112,
      width: 112,
    });
    expect(screen.getByLabelText('텀블러 찜')).toHaveStyle({
      height: 44,
      width: 44,
    });
    expect(screen.getByTestId('product-card-bookmark-surface')).toHaveStyle({
      borderRadius: 18,
      height: 36,
      width: 36,
    });
  });

  it('explains why saving is unavailable offline', () => {
    mockOnline = false;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 찜'));

    expect(alertSpy).toHaveBeenCalledWith(
      '오프라인',
      '온라인에서 찜을 변경할 수 있습니다.',
    );
  });
});
