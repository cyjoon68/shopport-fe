import type { render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { useOnline } from '@/providers/network-provider';
import { deleteDraft, readDraft, saveDraft } from '@/shared/storage';

import {
  pollAssetUntilSettled,
  readAssetStatus,
  removeUploadedAsset,
} from '../../../api/fetchers';
import { selectAndUploadAsset } from '../../../attachments';
import { ChatComposer } from '../chat-composer';

export type DraftValue = Readonly<{
  text: string;
  assetId: string | null;
  assetUri: string | null;
}>;

export const mockedReadDraft = readDraft as jest.MockedFunction<typeof readDraft>;
export const mockedDeleteDraft = deleteDraft as jest.MockedFunction<typeof deleteDraft>;
export const mockedSaveDraft = saveDraft as jest.MockedFunction<typeof saveDraft>;
export const mockedUseOnline = useOnline as jest.MockedFunction<typeof useOnline>;
export const mockedRemoveUploadedAsset = removeUploadedAsset as jest.MockedFunction<
  typeof removeUploadedAsset
>;
export const mockedSelectAndUploadAsset = selectAndUploadAsset as jest.MockedFunction<
  typeof selectAndUploadAsset
>;
export const mockedPollAssetUntilSettled = pollAssetUntilSettled as jest.MockedFunction<
  typeof pollAssetUntilSettled
>;
export const mockedReadAssetStatus = readAssetStatus as jest.MockedFunction<
  typeof readAssetStatus
>;
export const mockedImpactAsync = Haptics.impactAsync as jest.MockedFunction<
  typeof Haptics.impactAsync
>;

export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

export const composer = (conversationId: string) => (
  <ChatComposer
    conversationId={conversationId}
    loading={false}
    onSend={jest.fn(() => Promise.resolve())}
    onStop={jest.fn(() => Promise.resolve())}
  />
);

export const inputValue = (screen: ReturnType<typeof render>): string =>
  screen.getByLabelText('쇼핑 질문').props.value as string;

export const accessibilityDisabled = (
  screen: ReturnType<typeof render>,
  label: string,
): boolean => {
  const props = screen.getByLabelText(label).props as {
    accessibilityState?: { disabled?: boolean };
  };
  return props.accessibilityState?.disabled === true;
};

export const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

export const resetComposerMocks = (): void => {
  jest.useFakeTimers();
  mockedUseOnline.mockReturnValue(true);
  mockedReadDraft.mockReset();
  mockedReadDraft.mockResolvedValue({ text: '', assetId: null, assetUri: null });
  mockedDeleteDraft.mockReset();
  mockedDeleteDraft.mockResolvedValue(undefined);
  mockedSaveDraft.mockClear();
  mockedRemoveUploadedAsset.mockClear();
  mockedSelectAndUploadAsset.mockReset();
  mockedPollAssetUntilSettled.mockReset();
  mockedPollAssetUntilSettled.mockResolvedValue('READY');
  mockedReadAssetStatus.mockReset();
  mockedReadAssetStatus.mockResolvedValue('READY');
  mockedImpactAsync.mockReset();
  mockedImpactAsync.mockResolvedValue(undefined);
};

export const restoreComposerTimers = (): void => {
  jest.useRealTimers();
};
