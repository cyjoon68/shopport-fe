import { useContext } from 'react';

import { SessionContext } from './session-provider';
import type { SessionContextValue } from './types';

export const useSession = (): SessionContextValue => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
};
