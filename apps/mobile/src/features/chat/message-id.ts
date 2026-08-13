import * as Crypto from 'expo-crypto';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type StableChatMessageId = string & {
  readonly __stableChatMessageId: unique symbol;
};

export const isStableChatMessageId = (value: unknown): value is StableChatMessageId =>
  typeof value === 'string' && uuidPattern.test(value);

export const createStableChatMessageId = (): StableChatMessageId => {
  const id = Crypto.randomUUID();
  if (!isStableChatMessageId(id))
    throw new Error('채팅 메시지 ID를 생성하지 못했습니다.');
  return id;
};

export const messageIdentity = (source: 'server' | 'live', id: string): string =>
  isStableChatMessageId(id) ? id : `${source}:${id}`;
