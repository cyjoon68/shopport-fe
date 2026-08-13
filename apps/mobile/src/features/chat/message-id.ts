import * as Crypto from 'expo-crypto';

const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type StableChatMessageId = string & {
  readonly __stableChatMessageId: unique symbol;
};

export const isStableChatMessageId = (value: unknown): value is StableChatMessageId =>
  typeof value === 'string' && uuidV7Pattern.test(value);

type RandomBytes = (byteCount: number) => Uint8Array;

const byteToHex = (value: number): string => value.toString(16).padStart(2, '0');

export const createUuidV7 = (
  timestamp = Date.now(),
  randomBytes: RandomBytes = Crypto.getRandomBytes,
): string => {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
    throw new Error('UUIDv7 timestamp가 유효하지 않습니다.');
  }
  const bytes = randomBytes(16);
  if (bytes.length !== 16) throw new Error('UUIDv7 난수 바이트를 받지 못했습니다.');
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, byteToHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
};

export const createStableChatMessageId = (): StableChatMessageId => {
  const id = createUuidV7();
  if (!isStableChatMessageId(id))
    throw new Error('채팅 메시지 ID를 생성하지 못했습니다.');
  return id;
};

export const messageIdentity = (source: 'server' | 'live', id: string): string =>
  isStableChatMessageId(id) ? id : `${source}:${id}`;
