import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSessionBoundary } from '@/features/auth/session-boundary';
import type { CachedProduct } from '@/shared/storage/database';

type AddResult = 'added' | 'duplicate' | 'full';

type CompareContextValue = Readonly<{
  add: (product: CachedProduct) => AddResult;
  clear: () => void;
  products: ReadonlyArray<CachedProduct>;
  remove: (id: string) => void;
}>;

const CompareContext = createContext<CompareContextValue | null>(null);

export const CompareProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [products, setProducts] = useState<Array<CachedProduct>>([]);
  const { sessionVersion, status } = useSessionBoundary();
  const previousSession = useRef<{
    sessionVersion: number;
    status: typeof status;
  } | null>(null);

  useEffect(() => {
    const previous = previousSession.current;
    const shouldClear =
      status === 'guest' ||
      (status === 'authenticated' &&
        previous !== null &&
        (previous.status !== 'authenticated' ||
          previous.sessionVersion !== sessionVersion));
    previousSession.current = { sessionVersion, status };
    if (shouldClear) setProducts([]);
  }, [sessionVersion, status]);

  const add = useCallback(
    (product: CachedProduct): AddResult => {
      if (products.some(({ id }) => id === product.id)) return 'duplicate';
      if (products.length >= 4) return 'full';
      setProducts((current) => [...current, product]);
      return 'added';
    },
    [products],
  );
  const remove = useCallback((id: string): void => {
    setProducts((current) => current.filter((product) => product.id !== id));
  }, []);
  const clear = useCallback((): void => setProducts([]), []);
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
