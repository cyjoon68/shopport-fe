import { fireEvent, render } from '@testing-library/react-native';

import { AskUserCard } from '../../components/conversation/ask-user-card';
import { askUserArgsFromToolPart, parseAskUserArgs } from '../schemas';

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
    expect(parseAskUserArgs({ ...request, options: [request.options[0]] })).toBeNull();
    expect(parseAskUserArgs({ ...request, allowFreeText: 'yes' })).toBeNull();
    expect(parseAskUserArgs({ ...request, question: '가'.repeat(161) })).toBeNull();
    expect(
      parseAskUserArgs({
        ...request,
        options: [request.options[0], { id: request.options[0].id, label: '중복' }],
      }),
    ).toBeNull();
    expect(
      askUserArgsFromToolPart({
        type: 'tool-call',
        name: 'askUser',
        input: request,
      }),
    ).toEqual(request);
    expect(
      askUserArgsFromToolPart({
        type: 'tool-call',
        name: 'askUser',
        arguments: JSON.stringify(request),
      }),
    ).toEqual(request);
  });

  it('unlocks options when sending fails', async () => {
    const onSelect = jest.fn().mockRejectedValue(new Error('network'));
    const screen = render(<AskUserCard onSelect={onSelect} request={request} />);
    fireEvent.press(screen.getByText('검정'));
    await screen.findByText('답을 보내지 못했어요. 다시 눌러 주세요.');
    expect(screen.getByRole('button', { name: '흰색' })).not.toBeDisabled();
    expect(screen.getByText('답을 보내지 못했어요. 다시 눌러 주세요.')).toBeTruthy();
  });

  it('locks every option after sending the selected label', () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    const screen = render(<AskUserCard onSelect={onSelect} request={request} />);
    fireEvent.press(screen.getByText('검정'));
    fireEvent.press(screen.getByText('흰색'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('검정');
    expect(screen.getByRole('button', { name: '흰색' })).toBeDisabled();
  });

  it('keeps options readable with large font scaling metadata', () => {
    const screen = render(<AskUserCard onSelect={jest.fn()} request={request} />);
    expect(screen.getByText('어떤 색이 좋아요?').props.maxFontSizeMultiplier).toBe(3);
    expect(screen.getByText('검정').props.maxFontSizeMultiplier).toBe(3);
  });

  it('tells the user when only an option is accepted', () => {
    const screen = render(
      <AskUserCard onSelect={jest.fn()} request={{ ...request, allowFreeText: false }} />,
    );
    expect(screen.getByText('선택지에서 답해 주세요')).toBeTruthy();
  });

  it('does not accept an option while the assistant turn is still running', () => {
    const onSelect = jest.fn().mockResolvedValue(undefined);
    const screen = render(<AskUserCard disabled onSelect={onSelect} request={request} />);
    fireEvent.press(screen.getByText('검정'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '검정' })).toBeDisabled();
    expect(screen.getByText('답변을 보내는 중이에요')).toBeTruthy();
  });
});
