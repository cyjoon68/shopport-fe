import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSessionBoundary } from '@/features/auth/session-boundary';
import type { CachedProduct } from '@/shared/storage/database';

type AddResult = 'added' | 'duplicate' | 'full';

type ProductState = Readonly<{
  boundaryKey: string;
  products: Array<CachedProduct>;
}>;

type CompareContextValue = Readonly<{
  add: (product: CachedProduct) => AddResult;
  clear: () => void;
  products: ReadonlyArray<CachedProduct>;
  remove: (id: string) => void;
}>;

const CompareContext = createContext<CompareContextValue | null>(null);

export const CompareProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const { sessionVersion, status } = useSessionBoundary();
  const boundaryKey = `${status}:${sessionVersion}`;
  const [productState, setProductState] = useState<ProductState>(() => ({
    boundaryKey,
    products: [],
  }));
  const products = productState.boundaryKey === boundaryKey ? productState.products : [];

  useEffect(() => {
    setProductState((current) =>
      current.boundaryKey === boundaryKey ? current : { boundaryKey, products: [] },
    );
  }, [boundaryKey]);

  const add = useCallback(
    (product: CachedProduct): AddResult => {
      if (products.some(({ id }) => id === product.id)) return 'duplicate';
      if (products.length >= 4) return 'full';
      setProductState({ boundaryKey, products: [...products, product] });
      return 'added';
    },
    [boundaryKey, products],
  );
  const remove = useCallback(
    (id: string): void => {
      setProductState((current) => ({
        boundaryKey,
        products:
          current.boundaryKey === boundaryKey
            ? current.products.filter((product) => product.id !== id)
            : [],
      }));
    },
    [boundaryKey],
  );
  const clear = useCallback(
    (): void => setProductState({ boundaryKey, products: [] }),
    [boundaryKey],
  );
  const value = useMemo(
    () => ({ add, clear, products, remove }),
    [add, clear, products, remove],
  );
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
};

export const useCompare = (): CompareContextValue => {
  const value = useContext(CompareContext);
  if (!value) throw new Error('CompareProvider is missing');
  return value;
};
