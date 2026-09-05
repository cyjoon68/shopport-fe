import { Host, Icon } from '@expo/ui';
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';
import { View } from 'react-native';

import { PlatformIcon, platformIconSources } from '../platform-icon.android';

jest.mock('@expo/ui', () => ({ Host: 'Host', Icon: 'Icon' }));

const iconNames = [
  'arrow-up',
  'bag',
  'bookmark',
  'bookmark-filled',
  'copy',
  'delete',
  'edit',
  'menu',
  'new-chat',
  'photo',
  'photo-library',
  'pin-filled',
  'pin-off',
  'settings',
  'stop-filled',
];

describe('android platform icons', () => {
  it('provides a native source for every supported icon', () => {
    expect(Object.keys(platformIconSources)).toEqual(iconNames);
    expect(
      Object.values(platformIconSources).every((source) => typeof source === 'number'),
    ).toBe(true);
  });

  it('hosts the material icon at its requested size and color', () => {
    render(
      createElement(PlatformIcon, {
        color: '#112233',
        name: 'bookmark-filled',
        size: 20,
        testID: 'bookmark-icon',
      }),
    );

    expect(screen.UNSAFE_getByType(Host)).toHaveProp('matchContents', true);
    expect(screen.UNSAFE_getByType(Host)).toHaveStyle({ height: 20, width: 20 });
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp(
      'name',
      platformIconSources['bookmark-filled'],
    );
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('color', '#112233');
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('size', 20);
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('testID', 'bookmark-icon');
  });

  it('keeps the native host out of parent touch handling', () => {
    render(
      createElement(PlatformIcon, {
        color: '#112233',
        name: 'menu',
        size: 20,
      }),
    );

    const touchShield = screen.UNSAFE_getByType(View);
    expect(touchShield.props.pointerEvents).toBe('none');
    expect(touchShield.findByType(Host)).toBe(screen.UNSAFE_getByType(Host));
  });
});
