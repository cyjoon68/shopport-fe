import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { type RetailerId, retailerIds } from './chat-composer-types';
import { ChatQuickActions } from './chat-quick-actions';

const Fixture = () => {
  const [providerIds, setProviderIds] = useState<ReadonlyArray<RetailerId>>([]);
  const [text, setText] = useState('');
  const toggleProvider = (providerId: RetailerId): void => {
    setProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : retailerIds.filter((id) => current.includes(id) || id === providerId),
    );
  };
  return (
    <>
      <Text testID="selected-prompt">{text}</Text>
      <ChatQuickActions
        onProviderToggle={toggleProvider}
        providerIds={providerIds}
        setText={setText}
      />
    </>
  );
};

describe('chat quick actions', () => {
  it('warns for Olive Young and keeps Daiso available', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<Fixture />);

    fireEvent.press(screen.getByLabelText('올리브영 판매처 선택'));
    fireEvent.press(screen.getByLabelText('다이소 판매처 선택'));

    expect(alert).toHaveBeenCalledWith(
      '올리브영 검색을 사용할 수 없어요',
      '현재 올리브영 연동 서비스 문제로 상품 검색을 사용할 수 없습니다. 복구 전까지 다이소를 이용해 주세요.',
      [{ text: '확인' }],
    );
    expect(
      screen.getByLabelText('올리브영 판매처 선택').props.accessibilityState,
    ).toEqual({
      checked: false,
    });
    expect(screen.getByLabelText('다이소 판매처 선택').props.accessibilityState).toEqual({
      checked: true,
    });

    alert.mockRestore();
  });

  it('copies a selected prompt into the composer', () => {
    const screen = render(<Fixture />);

    fireEvent.press(screen.getByLabelText('최저가 찾기 프롬프트 열기'));
    fireEvent.press(screen.getByLabelText('프롬프트 선택: 파우더 최저가 찾아줘'));

    expect(screen.getByTestId('selected-prompt')).toHaveTextContent(
      '파우더 최저가 찾아줘',
    );
    expect(screen.queryByText('토너 패드 최저가 찾아줘')).toBeNull();
  });

  it('closes the prompt sheet from its backdrop', () => {
    const screen = render(<Fixture />);

    fireEvent.press(screen.getByLabelText('추천받기 프롬프트 열기'));
    expect(screen.getByText('모공 관리에 좋은 앰플 추천해줘')).toBeOnTheScreen();

    fireEvent.press(screen.UNSAFE_getByProps({ testID: 'quick-actions-sheet-backdrop' }));
    expect(screen.queryByText('모공 관리에 좋은 앰플 추천해줘')).toBeNull();
  });
});
