/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'echo-coral': '#FF6B6B',
        'echo-sunny': '#FFD93D',
        'echo-sky': '#6BC5F8',
        'echo-lime': '#A8E06C',
        'echo-lavender': '#C4A1FF',
        'echo-pink': '#FF8FAB',
        'echo-orange': '#FFB347',
        'echo-white': '#FEFEFE',
        'echo-cream': '#FFF9F0',
        'echo-charcoal': '#2D2D2D',
        'echo-gray': '#8E8E93',
        'echo-light-gray': '#F0F0F0',
        'echo-dark-bg': '#1A1A2E',
        'echo-dark-card': '#16213E',
      },
      fontFamily: {
        nunito: ['Nunito_400Regular'],
        'nunito-semibold': ['Nunito_600SemiBold'],
        'nunito-bold': ['Nunito_700Bold'],
        'nunito-extrabold': ['Nunito_800ExtraBold'],
        inter: ['Inter_400Regular'],
        'inter-semibold': ['Inter_600SemiBold'],
      },
      borderRadius: { '2xl': '16px', '3xl': '24px' },
    },
  },
  plugins: [],
};
