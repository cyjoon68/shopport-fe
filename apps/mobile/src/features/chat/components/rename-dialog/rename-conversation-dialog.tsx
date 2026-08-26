import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import type { RenameConversationDialogProps } from '../../types';
import { styles } from './styles';

export const RenameConversationDialog = ({
  initialTitle,
  onDismiss,
  onSubmit,
  visible,
}: RenameConversationDialogProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const submissionRef = useRef(0);
  const visibleRef = useRef(false);

  useEffect(() => {
    const opening = visible && !visibleRef.current;
    const closing = !visible && visibleRef.current;
    visibleRef.current = visible;
    if (closing) submissionRef.current += 1;
    if (opening) {
      submissionRef.current += 1;
      setTitle(initialTitle);
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [initialTitle, visible]);

  const dismiss = (): void => {
    if (!submitting) onDismiss();
  };

  const submit = async (): Promise<void> => {
    const nextTitle = title.trim();
    if (!nextTitle || submitting) return;
    const submission = submissionRef.current + 1;
    submissionRef.current = submission;
    setSubmitting(true);
    let succeeded = false;
    try {
      succeeded = await onSubmit(nextTitle);
    } catch {
      succeeded = false;
    }
    if (submissionRef.current !== submission) return;
    setSubmitting(false);
    if (succeeded) onDismiss();
  };

  const submitDisabled = submitting || !title.trim();

  return (
    <Modal
      animationType="fade"
      onRequestClose={dismiss}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={dismiss}
          style={styles.backdrop}
        />
        <View
          accessible
          accessibilityLabel="대화 이름 바꾸기"
          accessibilityViewIsModal
          role="dialog"
          style={styles.dialog}
        >
          <Text allowFontScaling style={styles.title}>
            대화 이름 바꾸기
          </Text>
          <View style={styles.field}>
            <Text allowFontScaling style={styles.label}>
              대화 이름
            </Text>
            <TextInput
              accessibilityLabel="대화 이름"
              editable={!submitting}
              onChangeText={setTitle}
              onSubmitEditing={() => void submit()}
              ref={inputRef}
              returnKeyType="done"
              selectTextOnFocus
              style={styles.input}
              value={title}
            />
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="취소"
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              disabled={submitting}
              onPress={dismiss}
              style={[styles.action, styles.cancel, submitting && styles.disabled]}
            >
              <Text allowFontScaling style={styles.cancelLabel}>
                취소
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="저장"
              accessibilityRole="button"
              accessibilityState={{ busy: submitting, disabled: submitDisabled }}
              disabled={submitDisabled}
              onPress={() => void submit()}
              style={[styles.action, styles.submit, submitDisabled && styles.disabled]}
            >
              <Text allowFontScaling style={styles.submitLabel}>
                저장
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
