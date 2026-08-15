import type { UploadedAsset } from './asset-upload';

export type Attachment = UploadedAsset &
  Readonly<{ state: 'checking' | 'processing' | 'ready' | 'timeout' }>;

export type ChatComposerProps = Readonly<{
  allowFreeText?: boolean;
  conversationId: string;
  loading: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  onStop: () => Promise<void>;
  sendInitialDraft?: boolean;
}>;
