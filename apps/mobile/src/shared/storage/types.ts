import type { ChatPersistedState } from '@tanstack/ai-client';

export type CachedProduct = Readonly<{
  id: string;
  title: string;
  imageUrl: string;
  providerId: string;
  providerName: string;
  amountMinor: string;
  shippingMinor: string;
  totalMinor: string;
  currency: string;
  isAffiliate: boolean;
  isInStock: boolean;
  outboundUrl: string;
  deliveryExpectedAt: string | null;
  observedAt: string;
  isSaved: boolean;
}>;

export type Draft = Readonly<{
  text: string;
  assetId: string | null;
  assetUri: string | null;
}>;

export type PendingChatWrite = {
  generation: number | null;
  removed: boolean;
  state: ChatPersistedState;
  timer: ReturnType<typeof setTimeout> | undefined;
  write: Promise<void> | undefined;
  writingState: ChatPersistedState | undefined;
};
