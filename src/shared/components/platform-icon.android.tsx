import ArrowUp from '@expo/material-symbols/arrow_upward.xml';
import Bookmark from '@expo/material-symbols/bookmark.xml';
import BookmarkFilled from '@expo/material-symbols/bookmark_added.xml';
import Copy from '@expo/material-symbols/content_copy.xml';
import Delete from '@expo/material-symbols/delete.xml';
import Edit from '@expo/material-symbols/edit.xml';
import NewChat from '@expo/material-symbols/edit_square.xml';
import PinFilled from '@expo/material-symbols/keep.xml';
import Menu from '@expo/material-symbols/menu.xml';
import Photo from '@expo/material-symbols/photo.xml';
import PhotoLibrary from '@expo/material-symbols/photo_library.xml';
import Settings from '@expo/material-symbols/settings.xml';
import Bag from '@expo/material-symbols/shopping_bag.xml';
import StopFilled from '@expo/material-symbols/stop_circle.xml';
import { Icon } from '@expo/ui';

import type {
  PlatformIconName,
  PlatformIconProps,
  PlatformIconSource,
} from './platform-icon';

export const platformIconSources = {
  'arrow-up': ArrowUp,
  bag: Bag,
  bookmark: Bookmark,
  'bookmark-filled': BookmarkFilled,
  copy: Copy,
  delete: Delete,
  edit: Edit,
  menu: Menu,
  'new-chat': NewChat,
  photo: Photo,
  'photo-library': PhotoLibrary,
  'pin-filled': PinFilled,
  settings: Settings,
  'stop-filled': StopFilled,
} satisfies Record<PlatformIconName, PlatformIconSource>;

export const PlatformIcon = ({ color, name, size, testID }: PlatformIconProps) => (
  <Icon
    color={color}
    name={platformIconSources[name]}
    size={size}
    {...(testID ? { testID } : {})}
  />
);
