import { Alert } from 'react-native';
import { useMutation } from '@apollo/client/react';
import {
  DeleteConversationDocument,
  RenameConversationDocument,
} from '@/graphql/generated/graphql';
import {
  deleteDraft,
  setConversationPinned,
  sqliteChatPersistence,
} from '@/shared/storage/database';

export type DrawerConversation = Readonly<{
  id: string;
  title: string;
}>;

type ConversationActionHandlersProps = Readonly<{
  conversation: DrawerConversation | null;
  online: boolean;
  pinned: boolean;
  onPinnedChange: (conversationId: string, pinned: boolean) => void;
  onRefresh: () => Promise<unknown>;
}>;

export const useConversationActionHandlers = ({
  conversation,
  online,
  pinned,
  onPinnedChange,
  onRefresh,
}: ConversationActionHandlersProps) => {
  const [renameConversation] = useMutation(RenameConversationDocument);
  const [deleteConversation] = useMutation(DeleteConversationDocument);

  const togglePin = (): void => {
    if (!conversation) return;
    const nextPinned = !pinned;
    void setConversationPinned(conversation.id, nextPinned)
      .then(() => {
        onPinnedChange(conversation.id, nextPinned);
      })
      .catch(() => Alert.alert('오류', '고정 상태를 저장하지 못했습니다.'));
  };

  const rename = (): void => {
    if (!conversation) return;
    if (!online) {
      Alert.alert('오프라인', '대화 이름 변경은 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.prompt(
      '대화 이름 바꾸기',
      undefined,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '저장',
          onPress: (title: string | undefined) => {
            const nextTitle = title?.trim();
            if (!nextTitle) return;
            void renameConversation({
              variables: { input: { id: conversation.id, title: nextTitle } },
            })
              .then(async (result) => {
                const message = result.data?.renameConversation.userErrors[0]?.message;
                if (message) {
                  Alert.alert('이름 변경 실패', message);
                  return;
                }
                try {
                  await onRefresh();
                } catch {
                  Alert.alert(
                    '이름 변경 완료',
                    '서버에서 이름은 변경됐지만 목록을 새로 고치지 못했습니다.',
                  );
                }
              })
              .catch(() => Alert.alert('이름 변경 실패', '다시 시도해 주세요.'));
          },
        },
      ],
      'plain-text',
      conversation.title,
    );
  };

  const remove = (): void => {
    if (!conversation) return;
    if (!online) {
      Alert.alert('오프라인', '대화 삭제는 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.alert('대화를 삭제할까요?', '메시지와 첨부 이미지도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void deleteConversation({ variables: { input: { id: conversation.id } } })
            .then(async (result) => {
              const payload = result.data?.deleteConversation;
              if (!payload?.success) {
                Alert.alert(
                  '삭제 실패',
                  payload?.userErrors[0]?.message ?? '다시 시도해 주세요.',
                );
                return;
              }
              let cacheCleanupFailed = false;
              const cleanupResults = await Promise.allSettled([
                sqliteChatPersistence.removeItem(conversation.id),
                setConversationPinned(conversation.id, false),
                deleteDraft(conversation.id),
              ]);
              cacheCleanupFailed = cleanupResults.some(
                ({ status }) => status === 'rejected',
              );
              try {
                await onRefresh();
              } catch {
                Alert.alert(
                  '삭제 완료',
                  cacheCleanupFailed
                    ? '서버에서 삭제되었지만 기기 캐시와 목록을 새로 고치지 못했습니다.'
                    : '서버에서 삭제되었지만 목록을 새로 고치지 못했습니다.',
                );
                return;
              }
              if (cacheCleanupFailed) {
                Alert.alert(
                  '삭제 완료',
                  '서버에서 삭제되었지만 기기 캐시를 정리하지 못했습니다.',
                );
              }
            })
            .catch(() => Alert.alert('삭제 실패', '다시 시도해 주세요.'));
        },
      },
    ]);
  };

  return { remove, rename, togglePin };
};
