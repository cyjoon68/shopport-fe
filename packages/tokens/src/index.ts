export const colors = {
  light: {
    background: '#F7F7F4',
    surface: '#FFFFFF',
    surfaceMuted: '#ECEDE8',
    text: '#171A16',
    textMuted: '#676D64',
    border: '#D9DDD5',
    primary: '#176B3A',
    primaryText: '#FFFFFF',
    danger: '#B42318',
  },
  dark: {
    background: '#111411',
    surface: '#1B201C',
    surfaceMuted: '#272D28',
    text: '#F1F4EF',
    textMuted: '#B1B9AF',
    border: '#3A423B',
    primary: '#62C488',
    primaryText: '#0D2415',
    danger: '#FF8A80',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const themes = {
  light: { colors: colors.light, spacing, radii },
  dark: { colors: colors.dark, spacing, radii },
} as const;

export const breakpoints = {
  phone: 0,
  tablet: 768,
} as const;
