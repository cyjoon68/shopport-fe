export type AskUserOption = Readonly<{ id: string; label: string }>;

export type AskUserRequest = Readonly<{
  allowFreeText: boolean;
  options: ReadonlyArray<AskUserOption>;
  question: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseAskUserArgs = (value: unknown): AskUserRequest | null => {
  if (!isRecord(value)) return null;
  const { allowFreeText, options, question } = value;
  if (
    typeof question !== 'string' ||
    !question.trim() ||
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
    return id && label ? [{ id, label }] : [];
  });
  if (
    parsed.length !== options.length ||
    new Set(parsed.map(({ id }) => id)).size !== parsed.length
  )
    return null;
  return { allowFreeText, options: parsed, question: question.trim() };
};

export const askUserArgsFromToolPart = (
  part: unknown,
): AskUserRequest | null => {
  if (!isRecord(part) || part.type !== 'tool-call' || part.name !== 'askUser')
    return null;
  return parseAskUserArgs(part.args ?? part.arguments ?? part.input);
};
