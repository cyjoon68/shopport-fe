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
    scrim: 'rgba(23, 26, 22, 0.32)',
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
    scrim: 'rgba(0, 0, 0, 0.48)',
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

export const interaction = {
  minTouchTarget: 44,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const typography = {
  conversation: {
    body: { fontSize: 16, lineHeight: 24 },
    hint: { fontSize: 14, lineHeight: 21 },
    sheetAction: { fontSize: 14, lineHeight: 21 },
    sheetTitle: { fontSize: 18, lineHeight: 24 },
  },
  productCard: {
    action: { compact: 13, regular: 14 },
    price: { compact: 16, regular: 19 },
    provider: { regular: 13 },
    status: { regular: 13 },
    title: {
      compact: { fontSize: 14, lineHeight: 19 },
      regular: { fontSize: 17, lineHeight: 23 },
    },
  },
} as const;

export const layout = {
  conversationSheet: {
    handleWidth: 40,
    maxHeight: '78%',
  },
} as const;

export const themes = {
  light: { colors: colors.light, interaction, layout, spacing, radii, typography },
  dark: { colors: colors.dark, interaction, layout, spacing, radii, typography },
} as const;

export const breakpoints = {
  phone: 0,
  tablet: 768,
} as const;
