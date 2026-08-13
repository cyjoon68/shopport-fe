import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useSessionBoundary } from '@/features/auth/session-boundary';
import type { CachedProduct } from '@/shared/storage/database';
import { CompareProvider, useCompare } from './compare-provider';

jest.mock('@/features/auth/session-boundary', () => ({
  useSessionBoundary: jest.fn(),
}));

const mockedUseSessionBoundary = useSessionBoundary as jest.MockedFunction<
  typeof useSessionBoundary
>;

const product: CachedProduct = {
  id: 'product-1',
  title: '상품',
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
};

let observedProducts: Array<string> = [];

const Harness = () => {
  const { add, products } = useCompare();
  observedProducts.push(products.map(({ id }) => id).join(','));
  return (
    <>
      <Pressable testID="add" onPress={() => add(product)}>
        <Text>추가</Text>
      </Pressable>
      <Text testID="products">{products.map(({ id }) => id).join(',')}</Text>
    </>
  );
};

describe('compare session isolation', () => {
  let snapshot: {
    status: 'authenticated' | 'booting' | 'guest';
    sessionVersion: number;
  };

  beforeEach(() => {
    snapshot = { status: 'authenticated', sessionVersion: 1 };
    observedProducts = [];
    mockedUseSessionBoundary.mockImplementation(() => snapshot);
  });

  it('clears products on logout and on a new authenticated account boundary', () => {
    const screen = render(
      <CompareProvider>
        <Harness />
      </CompareProvider>,
    );

    act(() => fireEvent.press(screen.getByTestId('add')));
    expect(screen.getByTestId('products').props.children).toBe('product-1');

    snapshot = { status: 'guest', sessionVersion: 1 };
    const beforeLogoutRender = observedProducts.length;
    act(() =>
      screen.rerender(
        <CompareProvider>
          <Harness />
        </CompareProvider>,
      ),
    );
    expect(observedProducts[beforeLogoutRender]).toBe('');
    expect(screen.getByTestId('products').props.children).toBe('');

    snapshot = { status: 'authenticated', sessionVersion: 2 };
    const beforeAccountSwitchRender = observedProducts.length;
    act(() =>
      screen.rerender(
        <CompareProvider>
          <Harness />
        </CompareProvider>,
      ),
    );
    expect(observedProducts[beforeAccountSwitchRender]).toBe('');
    act(() => fireEvent.press(screen.getByTestId('add')));
    expect(screen.getByTestId('products').props.children).toBe('product-1');

    snapshot = { status: 'authenticated', sessionVersion: 3 };
    const beforeSecondAccountSwitchRender = observedProducts.length;
    act(() =>
      screen.rerender(
        <CompareProvider>
          <Harness />
        </CompareProvider>,
      ),
    );
    expect(observedProducts[beforeSecondAccountSwitchRender]).toBe('');
    expect(screen.getByTestId('products').props.children).toBe('');
  });
});
