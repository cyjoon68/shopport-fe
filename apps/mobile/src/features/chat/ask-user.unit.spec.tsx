import { fireEvent, render } from '@testing-library/react-native';
import { AskUserCard } from './ask-user-card';
import { parseAskUserArgs } from './ask-user';

const request = {
  question: '어떤 색이 좋아요?',
  options: [
    { id: 'black', label: '검정' },
    { id: 'white', label: '흰색' },
  ],
  allowFreeText: true,
} as const;

describe('askUser', () => {
  it('parses the exact contract and rejects malformed arguments', () => {
    expect(parseAskUserArgs(request)).toEqual(request);
    expect(
      parseAskUserArgs({ ...request, options: [request.options[0]] }),
    ).toBeNull();
    expect(parseAskUserArgs({ ...request, allowFreeText: 'yes' })).toBeNull();
  });

  it('locks every option after sending the selected label', () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    const screen = render(
      <AskUserCard onSelect={onSelect} request={request} />,
    );
    fireEvent.press(screen.getByText('검정'));
    fireEvent.press(screen.getByText('흰색'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('검정');
    expect(screen.getByRole('button', { name: '흰색' })).toBeDisabled();
  });

  it('keeps options readable with large font scaling metadata', () => {
    const screen = render(
      <AskUserCard onSelect={jest.fn()} request={request} />,
    );
    expect(
      screen.getByText('어떤 색이 좋아요?').props.maxFontSizeMultiplier,
    ).toBe(3);
    expect(screen.getByText('검정').props.maxFontSizeMultiplier).toBe(3);
  });
});
