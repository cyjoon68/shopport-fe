import { Screen } from '@shopport/ui';
import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';
import { ProductList } from '@/features/catalog';

export const FoundProductsScreen = () => {
  const { status } = useSession();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <Screen testID="found-products-screen">
      <ProductList scope="all-conversations" />
    </Screen>
  );
};
