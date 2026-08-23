import type { UploadedAsset } from './asset-upload';

export const retailerIds = ['oliveyoung', 'daiso'] as const;

export type RetailerId = (typeof retailerIds)[number];

export type Attachment = UploadedAsset &
  Readonly<{ state: 'checking' | 'processing' | 'ready' | 'timeout' }>;

export type ChatComposerProps = Readonly<{
  allowFreeText?: boolean;
  conversationId: string;
  loading: boolean;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
  quickActionsEnabled?: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  onStop: () => Promise<void>;
  sendInitialDraft?: boolean;
}>;
