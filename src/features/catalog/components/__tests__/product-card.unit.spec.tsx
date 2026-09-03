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

import { cacheProducts } from '@/shared/storage';
import type { CachedProduct } from '@/shared/storage/types';

import { ProductCard } from '../product-card';

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
  availability: 'IN_STOCK',
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

jest.mock('@/shared/storage', () => ({
  cacheProducts: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/accessibility/hooks', () => ({
  useReducedMotion: () => false,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@expo/ui', () => ({
  Icon: ({ testID }: { testID?: string }) =>
    mockCreateElement(mockNativeText, { testID }, 'icon'),
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
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens the validated external link', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    expect(openURL).toHaveBeenCalledWith('https://example.com/product');
  });

  it('shows unknown availability without claiming that the product can be purchased', () => {
    const screen = render(
      <ProductCard product={{ ...product, availability: 'UNKNOWN' }} />,
    );

    expect(screen.getByText('재고 확인 필요')).toBeOnTheScreen();
    expect(screen.getByText('재고 확인 시간 알 수 없음')).toBeOnTheScreen();
    expect(screen.getByLabelText(/텀블러, ₩10,000, 재고 확인 필요/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/재고 확인 시간 알 수 없음/)).toBeOnTheScreen();
  });

  it('shows out-of-stock availability even when the legacy flag is true', () => {
    const screen = render(
      <ProductCard product={{ ...product, availability: 'OUT_OF_STOCK' }} />,
    );

    expect(screen.getByText('품절')).toBeOnTheScreen();
  });

  it('marks stock information observed more than a week ago as stale', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const screen = render(
      <ProductCard product={{ ...product, observedAt: '2026-08-22T12:00:00.000Z' }} />,
    );

    expect(screen.getByText('재고 정보 오래됨 · 8일 전 확인')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('텀블러, ₩10,000, 구매 가능, 재고 정보 오래됨 · 8일 전 확인'),
    ).toBeOnTheScreen();
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

  it('handles a malformed cached link without an unhandled rejection', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(
      <ProductCard product={{ ...product, outboundUrl: 'not a url' }} />,
    );

    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        '구매 링크를 열 수 없어요',
        '다시 시도해 주세요.',
      ),
    );
    expect(openURL).not.toHaveBeenCalled();
  });

  it('saves a product and updates the action state', async () => {
    const saveProduct = jest.fn().mockResolvedValue({
      data: { saveProduct: { product: { id: 'product-1' }, userErrors: [] } },
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

    await waitFor(() =>
      expect(screen.getByTestId('product-card-bookmark-filled-icon')).toBeOnTheScreen(),
    );
    expect(saveProduct).toHaveBeenCalledWith({
      variables: { input: { productId: 'product-1' } },
    });
    expect(jest.mocked(cacheProducts)).toHaveBeenCalledWith([
      { ...product, isSaved: true },
    ]);
  });

  it('keeps the saved state when the mutation returns no product or user error', async () => {
    const saveProduct = jest.fn().mockResolvedValue({
      data: { saveProduct: { product: null, userErrors: [] } },
    });
    mockedUseMutation.mockReturnValue([
      saveProduct,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 찜'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('찜 변경 실패', '찜을 변경하지 못했습니다.'),
    );
    expect(screen.getByTestId('product-card-bookmark-icon')).toBeOnTheScreen();
    expect(jest.mocked(cacheProducts)).not.toHaveBeenCalled();
  });

  it('reflects saved-state changes from a refreshed parent query', () => {
    const screen = render(<ProductCard product={product} />);

    screen.rerender(<ProductCard product={{ ...product, isSaved: true }} />);

    expect(screen.getByTestId('product-card-bookmark-filled-icon')).toBeOnTheScreen();
    expect(screen.getByLabelText('텀블러 찜 해제')).toBeOnTheScreen();
  });

  it('reports rejected save and outbound-link requests', async () => {
    const saveProduct = jest.fn().mockRejectedValue(new Error('Network request failed'));
    mockedUseMutation.mockReturnValue([
      saveProduct,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Cannot open URL'));
    const screen = render(<ProductCard product={product} />);

    fireEvent.press(screen.getByLabelText('텀블러 찜'));
    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        '찜 변경 실패',
        '연결을 확인하고 다시 시도해 주세요.',
      );
      expect(alertSpy).toHaveBeenCalledWith(
        '구매 링크를 열 수 없어요',
        '다시 시도해 주세요.',
      );
    });
  });

  it('uses a bookmark icon instead of a text label', () => {
    const screen = render(<ProductCard product={product} />);

    expect(screen.getByTestId('product-card-bookmark-icon')).toBeOnTheScreen();
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
