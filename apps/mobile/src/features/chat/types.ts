import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { RecommendedProduct } from '@/features/catalog';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/types';

export type AskUserOption = Readonly<{ id: string; label: string }>;

export type AskUserRequest = Readonly<{
  allowFreeText: boolean;
  options: ReadonlyArray<AskUserOption>;
  question: string;
}>;

export type UploadedAsset = Readonly<{ id: string; uri: string }>;

export type ConversationActionProps = Readonly<{
  conversation: Readonly<{ id: string; title: string }>;
  onDeleted: (conversationId: string) => void;
  online: boolean;
  pinned: boolean;
  onPinnedChange: (conversationId: string, pinned: boolean) => void;
  onRefresh: () => Promise<unknown>;
}>;

export type RenameConversationDialogProps = Readonly<{
  initialTitle: string;
  onDismiss: () => void;
  onSubmit: (title: string) => Promise<boolean>;
  visible: boolean;
}>;

export type Attachment = UploadedAsset &
  Readonly<{ state: 'checking' | 'processing' | 'ready' | 'rejected' | 'timeout' }>;

export type RetailerId = 'oliveyoung' | 'daiso';

export type AssetProcessingResult = 'READY' | 'REJECTED' | 'TIMEOUT';

export type AssetRemoteStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED';

export type PollOptions = Readonly<{
  intervalMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  readStatus?: (id: string) => Promise<AssetRemoteStatus>;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

export type ChatRunOptions = Readonly<{
  assetId: MutableRefObject<string | null>;
  conversationId: string;
  online: boolean;
  onFinish: () => void;
  providerIds: MutableRefObject<ReadonlyArray<RetailerId> | undefined>;
  remoteWorkRef: MutableRefObject<boolean>;
}>;

export type UploadedImage = Readonly<{
  id: string;
  url: string;
}>;

export type ChatComposerProps = Readonly<{
  allowFreeText?: boolean;
  conversationId: string;
  loading: boolean;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
  quickActionsEnabled?: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  onStop: () => Promise<void>;
  remoteWorkRef?: MutableRefObject<boolean> | undefined;
  sendInitialDraft?: boolean;
}>;

export type ChatComposerViewProps = Readonly<{
  allowFreeText: boolean;
  asset: Attachment | null;
  attach: () => Promise<void>;
  draftReady: boolean;
  loading: boolean;
  online: boolean;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  onStop: () => Promise<void>;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
  quickActionsEnabled: boolean;
  remove: () => Promise<void>;
  send: () => Promise<boolean>;
  sendDisabled: boolean;
  setText: (text: string) => void;
  text: string;
  uploading: boolean;
  verifyAsset: (asset: Attachment) => Promise<void>;
}>;

export type ChatNewConversationProps = Readonly<{
  loading: boolean;
  onCreate: (draft: string, withImage: boolean) => Promise<void>;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  online: boolean;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
}>;

export type ChatTab = '채팅' | '상품';

export type ChatScreenHeaderProps = Readonly<{
  onOpenDrawer: () => void;
  onOpenFavorites: () => void;
  onValueChange: (value: ChatTab) => void;
  unread: Readonly<Record<ChatTab, boolean>>;
  value: ChatTab;
}>;

export type ChatSegmentedControlProps = Readonly<{
  onValueChange: (value: ChatTab) => void;
  testID?: string | undefined;
  unread?: Readonly<Record<ChatTab, boolean>>;
  value: ChatTab;
}>;

export type ChatQuickActionsProps = Readonly<{
  onProviderToggle: (providerId: RetailerId) => void;
  providerIds: ReadonlyArray<RetailerId>;
  setText: (text: string) => void;
}>;

export type PromptGroupId = 'lowest' | 'recommend' | 'alternative';

export type NewChatFooterProps = Readonly<{
  attachDisabled: boolean;
  fill?: boolean;
  inputEditable: boolean;
  loading: boolean;
  onAttach: () => Promise<void>;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  onSend: () => Promise<void | boolean>;
  onStop?: () => Promise<void>;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
  quickActionsEnabled?: boolean;
  sendDisabled: boolean;
  setText: (text: string) => void;
  text: string;
}>;

export type AskUserCardProps = Readonly<{
  disabled?: boolean;
  disabledMessage?: string | undefined;
  onSelect: (label: string) => Promise<void>;
  request: AskUserRequest;
}>;

export type AskUserSheetProps = Readonly<{
  loading: boolean;
  onDismiss: () => Promise<void>;
  onSelect: (label: string) => Promise<void>;
  request: AskUserRequest;
  visible: boolean;
}>;

export type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

export type DisplayImage = Readonly<{
  id: string;
  status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED';
  url: string | null;
}>;

export type DisplayTool = Readonly<{
  id: string;
  name: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
}>;

export type DisplayMessage = Readonly<{
  askUsers: ReadonlyArray<Readonly<{ id: string; request: AskUserRequest }>>;
  id: string;
  images: ReadonlyArray<DisplayImage>;
  products: ReadonlyArray<CachedProduct>;
  recommendations: ReadonlyArray<RecommendedProduct>;
  role: 'user' | 'assistant';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  text: string;
  tools: ReadonlyArray<DisplayTool>;
}>;

export type DisplayMessageMergeCacheEntry = Readonly<{
  historical: DisplayMessage;
  live: DisplayMessage;
  merged: DisplayMessage;
}>;

export type DisplayMessageMergeCache = Map<string, DisplayMessageMergeCacheEntry>;

export type MessageListProps = Readonly<{
  isGenerating?: boolean;
  messages: ReadonlyArray<DisplayMessage>;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

export type MessageListItemProps = Readonly<{
  activeAskUserId: string | null;
  animate: boolean;
  message: DisplayMessage;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

export type ComposerLifecycle = {
  conversationId: string;
  generation: number;
  mounted: boolean;
  version: number;
};

export type ComposerState = Readonly<{
  applyProcessingResult: (id: string, result: AssetProcessingResult) => void;
  asset: Attachment | null;
  assetRef: MutableRefObject<Attachment | null>;
  deleteDraft: (conversationId: string) => Promise<void>;
  draftReadyFor: string | null;
  isCurrentConversation: (id: string, version: number, generation?: number) => boolean;
  lifecycleRef: MutableRefObject<ComposerLifecycle>;
  setAsset: Dispatch<SetStateAction<Attachment | null>>;
  setText: Dispatch<SetStateAction<string>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  text: string;
  uploading: boolean;
  verifyAsset: (target: Attachment) => Promise<void>;
}>;

export type ComposerActionsArgs = Readonly<{
  allowFreeText: boolean;
  conversationId: string;
  loading: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  online: boolean;
  remoteWorkRef: MutableRefObject<boolean>;
  state: ComposerState;
}>;

export type StableChatMessageId = string & {
  readonly __stableChatMessageId: unique symbol;
};

export type RandomBytes = (byteCount: number) => Uint8Array;

export type ChatErrorPresentation = Readonly<{
  message: string;
  route: null;
}>;
