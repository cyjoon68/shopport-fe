import { getAccessToken } from '@/features/auth/auth-token';
import {
  AssetDocument,
  CreateAssetUploadDocument,
  DeleteAssetDocument,
} from '@/graphql/generated/graphql';
import { apolloClient } from '@/providers/apollo-client';
import { environment } from '@/shared/config/environment';

import type { AssetProcessingResult, AssetRemoteStatus, PollOptions } from '../types';

export type CancelRunOutcome = 'cancelled' | 'already_cancelled' | 'completed' | 'failed';

const cancelOutcomes = ['cancelled', 'already_cancelled', 'completed', 'failed'] as const;

const isCancelRunOutcome = (value: unknown): value is CancelRunOutcome =>
  typeof value === 'string' && (cancelOutcomes as ReadonlyArray<string>).includes(value);

export const readAssetStatus = async (id: string): Promise<AssetRemoteStatus> => {
  const result = await apolloClient.query({
    query: AssetDocument,
    variables: { id },
    fetchPolicy: 'network-only',
  });
  const asset = result.data?.asset;
  if (!asset) throw new Error('첨부 이미지를 찾을 수 없습니다.');
  return asset.status;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const pollAssetUntilSettled = async (
  id: string,
  options: PollOptions = {},
): Promise<AssetProcessingResult> => {
  const intervalMs = options.intervalMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  const now = options.now ?? Date.now;
  const load = options.readStatus ?? readAssetStatus;
  const sleep = options.sleep ?? wait;
  const startedAt = now();

  while (true) {
    const status = await load(id);
    if (status === 'READY' || status === 'REJECTED') return status;
    const remaining = maxWaitMs - (now() - startedAt);
    if (remaining <= 0) return 'TIMEOUT';
    await sleep(Math.min(intervalMs, remaining));
  }
};

export const createAssetUpload = async (
  conversationId: string,
  contentType: string,
  byteSize: string,
) => {
  const response = await apolloClient.mutate({
    mutation: CreateAssetUploadDocument,
    variables: { input: { byteSize, contentType, conversationId } },
  });
  const payload = response.data?.createAssetUpload;
  if (!payload?.upload) {
    throw new Error(
      payload?.userErrors[0]?.message ?? '이미지 업로드를 준비하지 못했습니다.',
    );
  }
  return payload.upload;
};

export const removeUploadedAsset = async (id: string): Promise<void> => {
  const response = await apolloClient.mutate({
    mutation: DeleteAssetDocument,
    variables: { input: { id } },
  });
  const payload = response.data?.deleteAsset;
  if (!payload || payload.success !== true) {
    throw new Error(payload?.userErrors?.[0]?.message || '이미지를 삭제하지 못했습니다.');
  }
};

const cancelChatRun = async (
  threadId: string,
  runId: string,
): Promise<CancelRunOutcome> => {
  const token = getAccessToken();
  const response = await fetch(`${environment.apiUrl}/v1/ai/chat/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ threadId, runId }),
  });
  if (!response.ok) throw new Error('응답을 중지하지 못했습니다. 다시 시도해 주세요.');
  const payload: unknown = await response
    .json()
    .catch(() =>
      Promise.reject(new Error('응답을 중지하지 못했습니다. 다시 시도해 주세요.')),
    );
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('outcome' in payload) ||
    !isCancelRunOutcome(payload.outcome)
  )
    throw new Error('응답을 중지하지 못했습니다. 다시 시도해 주세요.');
  return payload.outcome;
};

export const cancelRunThenStop = async (
  threadId: string,
  runId: string,
  stop: () => void,
): Promise<CancelRunOutcome> => {
  try {
    return await cancelChatRun(threadId, runId);
  } finally {
    stop();
  }
};
