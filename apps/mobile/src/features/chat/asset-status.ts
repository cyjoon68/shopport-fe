import { AssetDocument } from '@/graphql/generated/graphql';
import { apolloClient } from '@/providers/apollo-client';

export type AssetProcessingResult = 'READY' | 'REJECTED' | 'TIMEOUT';
export type AssetRemoteStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED';

type PollOptions = Readonly<{
  intervalMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  readStatus?: (id: string) => Promise<AssetRemoteStatus>;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

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
