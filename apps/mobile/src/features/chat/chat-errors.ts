type ChatErrorPresentation = Readonly<{
  message: string;
  route: '/subscription' | null;
}>;

const errorCode = (error: unknown): string | null => {
  if (typeof error === 'string') {
    if (error.includes('TRIAL_EXPIRED')) return 'TRIAL_EXPIRED';
    if (error.includes('QUOTA_EXCEEDED')) return 'QUOTA_EXCEEDED';
    try {
      return errorCode(JSON.parse(error));
    } catch {
      return null;
    }
  }
  if (typeof error !== 'object' || error === null) return null;
  const record = error as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;
  return errorCode(record.cause) ?? errorCode(record.message) ?? errorCode(record.error);
};

export const quotaResetMessage = (now = new Date()): string => {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  const resetAt = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1) -
      9 * 60 * 60 * 1_000,
  );
  const reset = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(resetAt);
  return `오늘의 AI 사용량을 모두 사용했습니다. ${reset} KST에 다시 사용할 수 있습니다.`;
};

export const chatErrorPresentation = (
  error: unknown,
  now = new Date(),
): ChatErrorPresentation => {
  const code = errorCode(error);
  if (code === 'TRIAL_EXPIRED') {
    return {
      message: '무료 체험이 종료되었습니다. 구독을 확인해 주세요.',
      route: '/subscription',
    };
  }
  if (code === 'QUOTA_EXCEEDED') {
    return { message: quotaResetMessage(now), route: null };
  }
  return {
    message: '응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.',
    route: null,
  };
};
