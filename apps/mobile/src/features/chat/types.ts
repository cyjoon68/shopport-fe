export type AskUserOption = Readonly<{ id: string; label: string }>;

export type AskUserRequest = Readonly<{
  allowFreeText: boolean;
  options: ReadonlyArray<AskUserOption>;
  question: string;
}>;
