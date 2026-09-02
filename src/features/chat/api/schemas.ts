import type { AskUserRequest } from '../types';

export const ASK_USER_SKIP_MESSAGE = '질문을 건너뛰고 현재 정보로 계속 진행해줘.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseAskUserArgs = (value: unknown): AskUserRequest | null => {
  if (!isRecord(value)) return null;
  const { allowFreeText, options, question } = value;
  if (
    typeof question !== 'string' ||
    !question.trim() ||
    question.trim().length > 160 ||
    typeof allowFreeText !== 'boolean' ||
    !Array.isArray(options) ||
    options.length < 2 ||
    options.length > 4
  )
    return null;
  const parsed = options.flatMap((option) => {
    if (
      !isRecord(option) ||
      typeof option.id !== 'string' ||
      typeof option.label !== 'string'
    )
      return [];
    const id = option.id.trim();
    const label = option.label.trim();
    return id && id.length <= 64 && label && label.length <= 30 ? [{ id, label }] : [];
  });
  if (
    parsed.length !== options.length ||
    new Set(parsed.map(({ id }) => id)).size !== parsed.length
  )
    return null;
  return { allowFreeText, options: parsed, question: question.trim() };
};

export const askUserArgsFromToolPart = (part: unknown): AskUserRequest | null => {
  if (!isRecord(part) || part.type !== 'tool-call' || part.name !== 'askUser')
    return null;
  if (part.input !== undefined) return parseAskUserArgs(part.input);
  if (typeof part.arguments !== 'string') return null;
  try {
    return parseAskUserArgs(JSON.parse(part.arguments));
  } catch {
    return null;
  }
};
