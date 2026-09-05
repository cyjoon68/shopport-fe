import { Host, Icon } from '@expo/ui';
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';

import { PlatformIcon, platformIconSources } from '../platform-icon.ios';

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

describe('ios platform icons', () => {
  it('provides an SF Symbol for every supported icon', () => {
    expect(Object.keys(platformIconSources)).toEqual(iconNames);
    expect(
      Object.values(platformIconSources).every((source) => typeof source === 'string'),
    ).toBe(true);
  });

  it('hosts the SF Symbol at its requested size and color', () => {
    render(
      createElement(PlatformIcon, {
        color: '#112233',
        name: 'bookmark-filled',
        size: 20,
        testID: 'bookmark-icon',
      }),
    );

    expect(screen.UNSAFE_getByType(Host)).toHaveProp('matchContents', true);
    expect(screen.UNSAFE_getByType(Host)).toHaveProp('pointerEvents', 'none');
    expect(screen.UNSAFE_getByType(Host)).toHaveStyle({ height: 20, width: 20 });
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp(
      'name',
      platformIconSources['bookmark-filled'],
    );
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('color', '#112233');
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('size', 20);
    expect(screen.UNSAFE_getByType(Icon)).toHaveProp('testID', 'bookmark-icon');
  });
});
