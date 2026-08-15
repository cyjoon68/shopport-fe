import type { UIMessage } from '@tanstack/ai-react';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import {
  productFromFragment,
  productsFromToolResult,
} from '@/features/catalog/product-model';
import type { CachedProduct } from '@/shared/storage/database';
import { messageIdentity } from './message-id';
import { askUserArgsFromToolPart } from './ask-user';
import type { AskUserRequest } from './types';

type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

type DisplayImage = Readonly<{
  id: string;
  status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED';
  url: string | null;
}>;

export type DisplayTool = Readonly<{
  id: string;
  name: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
}>;

export type DisplayMessage = Readonly<{
  askUsers: ReadonlyArray<Readonly<{ id: string; request: AskUserRequest }>>;
  id: string;
  images: ReadonlyArray<DisplayImage>;
  products: ReadonlyArray<CachedProduct>;
  role: 'user' | 'assistant';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  text: string;
  tools: ReadonlyArray<DisplayTool>;
}>;

const uniqueById = <T extends Readonly<{ id: string }>>(
  values: ReadonlyArray<T>,
): Array<T> => Array.from(new Map(values.map((value) => [value.id, value])).values());

const imageUrl = (part: Extract<UIMessage['parts'][number], { type: 'image' }>) =>
  part.source.type === 'url'
    ? part.source.value
    : `data:${part.source.mimeType};base64,${part.source.value}`;

export const fromLiveMessage = (message: UIMessage): DisplayMessage => {
  const tools: Array<DisplayTool> = [];
  for (const part of message.parts) {
    if (part.type === 'tool-call') {
      tools.push({
        id: part.id,
        name: part.name,
        status:
          part.state === 'complete'
            ? 'COMPLETED'
            : part.state === 'error'
              ? 'FAILED'
              : 'STARTED',
      });
    }
    if (part.type === 'tool-result' && !tools.some(({ id }) => id === part.toolCallId)) {
      tools.push({
        id: part.toolCallId,
        name: '상품 검색',
        status:
          part.state === 'error'
            ? 'FAILED'
            : part.state === 'complete'
              ? 'COMPLETED'
              : 'STARTED',
      });
    }
  }
  return {
    askUsers: message.parts.flatMap((part) => {
      const request = askUserArgsFromToolPart(part);
      return request && part.type === 'tool-call' ? [{ id: part.id, request }] : [];
    }),
    id: messageIdentity('live', message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    status: tools.some(({ status }) => status === 'FAILED')
      ? 'FAILED'
      : tools.some(({ status }) => status === 'STARTED')
        ? 'PENDING'
        : 'COMPLETED',
    text: message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(''),
    images: message.parts.flatMap((part, index) =>
      part.type === 'image'
        ? [
            {
              id: `${message.id}:image:${index}`,
              status: 'READY' as const,
              url: imageUrl(part),
            },
          ]
        : [],
    ),
    products: message.parts.flatMap((part) =>
      part.type === 'tool-result' ? productsFromToolResult(part.content) : [],
    ),
    tools,
  };
};

export const fromHistoricalMessage = (message: HistoricalMessage): DisplayMessage => ({
  askUsers: message.parts.flatMap((part) =>
    part.__typename === 'AskUserMessagePart'
      ? [
          {
            id: part.id,
            request: {
              allowFreeText: part.allowFreeText,
              options: part.options,
              question: part.question,
            },
          },
        ]
      : [],
  ),
  id: messageIdentity('server', message.id),
  role: message.role === 'USER' ? 'user' : 'assistant',
  status: message.status,
  text: message.parts
    .flatMap((part) => (part.__typename === 'TextMessagePart' ? [part.text] : []))
    .join(''),
  images: message.parts.flatMap((part) =>
    part.__typename === 'ImageMessagePart'
      ? [
          {
            id: part.id,
            status: part.asset.status,
            url: part.asset.url ?? null,
          },
        ]
      : [],
  ),
  products: message.parts.flatMap((part) =>
    part.__typename === 'ProductReferenceMessagePart'
      ? [productFromFragment(part.product)]
      : [],
  ),
  tools: message.parts.flatMap((part) =>
    part.__typename === 'ToolStatusMessagePart'
      ? [{ id: part.id, name: part.toolName, status: part.status }]
      : [],
  ),
});

const mergeDisplayMessage = (
  historical: DisplayMessage,
  live: DisplayMessage,
): DisplayMessage => ({
  ...historical,
  ...live,
  text: live.text || historical.text,
  images: uniqueById([...historical.images, ...live.images]),
  products: uniqueById([...historical.products, ...live.products]),
  tools: uniqueById([...historical.tools, ...live.tools]),
  askUsers: live.askUsers.length ? live.askUsers : historical.askUsers,
});

export const mergeMessages = (
  historical: ReadonlyArray<HistoricalMessage>,
  live: ReadonlyArray<UIMessage>,
): Array<DisplayMessage> => {
  const merged = historical.map(fromHistoricalMessage);
  const positions = new Map(merged.map((message, index) => [message.id, index]));
  for (const message of live.map(fromLiveMessage)) {
    const position = positions.get(message.id);
    if (position === undefined) {
      positions.set(message.id, merged.length);
      merged.push(message);
    } else {
      const previous = merged[position];
      if (previous) merged[position] = mergeDisplayMessage(previous, message);
    }
  }
  return merged;
};

export const activeAskUserRequest = (
  messages: ReadonlyArray<DisplayMessage>,
): Readonly<{ id: string; request: AskUserRequest }> | null => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === 'assistant' ? (lastMessage.askUsers.at(-1) ?? null) : null;
};
