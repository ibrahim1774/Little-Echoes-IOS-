import { StyleSheet, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/lib/theme';

/** The web's `bg-gradient-to-b from-echo-cream to-white` (and its dark pair). */
export function GradientBackground() {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const from = dark ? colors.darkBg : colors.cream;
  const to = dark ? colors.darkCard : '#FFFFFF';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="today-bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#today-bg)" />
      </Svg>
    </View>
  );
}
