import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
