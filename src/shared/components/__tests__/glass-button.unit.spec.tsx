import { render, screen } from '@testing-library/react-native';
import { GlassView } from 'expo-glass-effect';
import { Platform } from 'react-native';

import { GlassActionButton } from '../glass-button';

let mockGlassAvailable = false;

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: () => mockGlassAvailable,
}));

jest.mock('@/shared/accessibility/hooks', () => ({
  useReducedTransparency: () => false,
}));

describe('glass action button colors', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    mockGlassAvailable = false;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('uses a contrasting foreground on the opaque danger fallback', () => {
    render(
      <GlassActionButton onPress={jest.fn()} variant="danger">
        회원 탈퇴
      </GlassActionButton>,
    );

    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: '#B42318' });
    expect(screen.getByText('회원 탈퇴')).toHaveStyle({ color: '#FFFFFF' });
  });

  it('uses a dark foreground on the Kakao yellow fallback', () => {
    render(
      <GlassActionButton onPress={jest.fn()} variant="kakao">
        카카오로 계속하기
      </GlassActionButton>,
    );

    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: '#FEE500' });
    expect(screen.getByText('카카오로 계속하기')).toHaveStyle({ color: '#191919' });
  });

  it('keeps the danger foreground semantic on transparent glass', () => {
    mockGlassAvailable = true;

    render(
      <GlassActionButton onPress={jest.fn()} variant="danger">
        회원 탈퇴
      </GlassActionButton>,
    );

    expect(screen.getByText('회원 탈퇴')).toHaveStyle({ color: '#B42318' });
    expect(screen.UNSAFE_getByType(GlassView)).not.toHaveProp('tintColor');
  });
});
