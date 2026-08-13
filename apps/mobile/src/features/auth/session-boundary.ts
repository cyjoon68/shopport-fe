import { createContext, useContext } from 'react';

export type SessionStatus = 'booting' | 'authenticated' | 'guest';

export type SessionBoundary = Readonly<{
  sessionVersion: number;
  status: SessionStatus;
}>;

export const SessionBoundaryContext = createContext<SessionBoundary | null>(null);

export const useSessionBoundary = (): SessionBoundary => {
  const value = useContext(SessionBoundaryContext);
  if (!value) throw new Error('SessionBoundaryProvider is missing');
  return value;
};
