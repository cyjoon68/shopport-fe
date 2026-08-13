import type { breakpoints, themes } from '@shopport/tokens';

type ShopportThemes = typeof themes;
type ShopportBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends ShopportThemes {}
  export interface UnistylesBreakpoints extends ShopportBreakpoints {}
}

export { ActionButton } from './action-button';
export { EmptyState } from './empty-state';
export { Screen } from './screen';
export { SectionTitle } from './section-title';
