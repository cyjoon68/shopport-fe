export const colors = {
  light: {
    background: '#F5F5F3',
    surface: '#FFFFFF',
    surfaceMuted: '#ECEDE8',
    text: '#171A16',
    textMuted: '#676D64',
    border: '#D9DDD5',
    primary: '#1F2228',
    primaryText: '#FFFFFF',
    danger: '#B42318',
  },
  dark: {
    background: '#1F2228',
    surface: '#26292F',
    surfaceMuted: '#2A2D33',
    text: '#FFFFFF',
    textMuted: '#BFC0C2',
    border: '#3A3D42',
    primary: '#FFFFFF',
    primaryText: '#1F2228',
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
  sm: 0,
  md: 0,
  lg: 4,
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
