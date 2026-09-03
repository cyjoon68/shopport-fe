import type { MenuAction } from '@expo/ui/community/menu';
import type { JSX } from 'react';
import type { ColorValue } from 'react-native';

export type PlatformIconName =
  | 'arrow-up'
  | 'bag'
  | 'bookmark'
  | 'bookmark-filled'
  | 'copy'
  | 'delete'
  | 'edit'
  | 'menu'
  | 'new-chat'
  | 'photo'
  | 'photo-library'
  | 'pin-filled'
  | 'settings'
  | 'stop-filled';

export type PlatformIconProps = {
  color: ColorValue;
  name: PlatformIconName;
  size: number;
  testID?: string;
};

export type PlatformIconSource = NonNullable<MenuAction['image']>;

export declare const PlatformIcon: (props: PlatformIconProps) => JSX.Element;
export declare const platformIconSources: Readonly<
  Record<PlatformIconName, PlatformIconSource>
>;
