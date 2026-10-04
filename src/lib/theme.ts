import type { ViewStyle } from 'react-native';

export const colors = {
  coral: '#FF6B6B',
  sunny: '#FFD93D',
  sky: '#6BC5F8',
  lime: '#A8E06C',
  lavender: '#C4A1FF',
  pink: '#FF8FAB',
  orange: '#FFB347',
  white: '#FEFEFE',
  cream: '#FFF9F0',
  charcoal: '#2D2D2D',
  gray: '#8E8E93',
  lightGray: '#F0F0F0',
  darkBg: '#1A1A2E',
  darkCard: '#16213E',
} as const;

// Tailwind box-shadows don't translate to native, so shadows are style objects.
export const shadows: Record<'soft' | 'coral' | 'lg', ViewStyle> = {
  soft: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  coral: { shadowColor: '#FF6B6B', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  lg: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};
