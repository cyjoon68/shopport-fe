import { Icon } from '@expo/ui';

import type {
  PlatformIconName,
  PlatformIconProps,
  PlatformIconSource,
} from './platform-icon';

export const platformIconSources = {
  'arrow-up': 'arrow.up',
  bag: 'bag',
  bookmark: 'bookmark',
  'bookmark-filled': 'bookmark.fill',
  copy: 'doc.on.doc',
  delete: 'trash',
  edit: 'pencil',
  menu: 'sidebar.left',
  'new-chat': 'square.and.pencil',
  photo: 'photo',
  'photo-library': 'photo.on.rectangle',
  'pin-filled': 'pin.fill',
  settings: 'gearshape',
  'stop-filled': 'stop.fill',
} as const satisfies Record<PlatformIconName, PlatformIconSource>;

export const PlatformIcon = ({ color, name, size, testID }: PlatformIconProps) => (
  <Icon
    color={color}
    name={platformIconSources[name]}
    size={size}
    {...(testID ? { testID } : {})}
  />
);
