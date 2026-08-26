import type { ReactNode } from 'react';

export type AuthProviderName = 'kakao';

export type TokenPair = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

export type IdentityCredential = Readonly<{
  identityToken: string;
  nonce: string;
}>;

export type SessionStatus = 'booting' | 'authenticated' | 'guest';

export type SessionContextValue = Readonly<{
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  sessionVersion: number;
  status: SessionStatus;
}>;

export type SessionProviderProps = Readonly<{
  children: ReactNode;
}>;
