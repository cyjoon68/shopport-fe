const cancellationPattern = /(?:cancel|취소)/iu;

export const loginErrorMessage = (error: unknown): string | null => {
  if (error instanceof Error && cancellationPattern.test(error.message)) {
    return null;
  }
  return '로그인에 실패했습니다. 다시 시도해 주세요.';
};
