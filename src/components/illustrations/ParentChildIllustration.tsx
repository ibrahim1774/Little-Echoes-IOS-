import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

// Emoji are RN <Text> overlays (SVG text doesn't draw colour emoji reliably).
// x/y are the web SVG's text anchor: left edge and baseline, in viewBox units.
const EMOJIS = [
  { char: '❤️', x: 50, y: 80, size: 16 },
  { char: '💛', x: 195, y: 75, size: 12 },
  { char: '💜', x: 115, y: 60, size: 14 },
  { char: '✨', x: 30, y: 130, size: 12 },
  { char: '⭐', x: 220, y: 120, size: 10 },
  { char: '🌟', x: 140, y: 45, size: 12 },
];

export function ParentChildIllustration() {
  return (
    <View className="w-full max-w-[280px]" style={{ aspectRatio: 280 / 200 }}>
      <Svg width="100%" height="100%" viewBox="0 0 280 200" fill="none">
        {/* Background circles */}
        <Circle cx="140" cy="140" r="80" fill="#FFD93D" fillOpacity="0.12" />
        <Circle cx="140" cy="140" r="55" fill="#FF6B6B" fillOpacity="0.08" />

        {/* Parent */}
        <Rect x="70" y="115" width="28" height="50" rx="14" fill="#6BC5F8" />
        <Circle cx="84" cy="105" r="20" fill="#FFB347" />
        <Ellipse cx="84" cy="88" rx="18" ry="10" fill="#2D2D2D" />
        <Path d="M78 108 Q84 114 90 108" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" fill="none" />
        <Circle cx="79" cy="103" r="2.5" fill="#2D2D2D" />
        <Circle cx="89" cy="103" r="2.5" fill="#2D2D2D" />

        {/* Child */}
        <Rect x="158" y="128" width="22" height="40" rx="11" fill="#FF8FAB" />
        <Circle cx="169" cy="118" r="16" fill="#FFB347" />
        <Ellipse cx="169" cy="104" rx="14" ry="8" fill="#FF6B6B" />
        <Path d="M164 120 Q169 126 174 120" stroke="#2D2D2D" strokeWidth="2" strokeLinecap="round" fill="none" />
        <Circle cx="165" cy="116" r="2" fill="#2D2D2D" />
        <Circle cx="173" cy="116" r="2" fill="#2D2D2D" />

        {/* Holding hands connector */}
        <Path d="M98 145 Q130 140 158 148" stroke="#FFB347" strokeWidth="4" strokeLinecap="round" fill="none" />
      </Svg>

      {/* Floating hearts and stars */}
      {EMOJIS.map((e) => (
        <Text
          key={e.char}
          allowFontScaling={false}
          style={{
            position: 'absolute',
            left: `${(e.x / 280) * 100}%`,
            top: `${((e.y - e.size) / 200) * 100}%`,
            fontSize: e.size,
            lineHeight: e.size * 1.25,
          }}
        >
          {e.char}
        </Text>
      ))}
    </View>
  );
}
