import { getAccessToken } from '@/features/auth/auth-token';
import { environment } from '@/shared/config/environment';

const cancelChatRun = async (threadId: string, runId: string): Promise<void> => {
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
};

export const cancelRunThenStop = async (
  threadId: string,
  runId: string,
  stop: () => void,
): Promise<void> => {
  try {
    await cancelChatRun(threadId, runId);
  } finally {
    stop();
  }
};
