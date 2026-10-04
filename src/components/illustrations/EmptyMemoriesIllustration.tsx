import { Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

// Emoji are native <Text> laid over the SVG: SVG text doesn't render colour emoji reliably.
const EMOJI: { char: string; x: number; y: number; size: number }[] = [
  { char: '🎵', x: 32, y: 75, size: 20 },
  { char: '🎶', x: 185, y: 80, size: 16 },
  { char: '🎵', x: 110, y: 50, size: 18 },
  { char: '✨', x: 20, y: 130, size: 14 },
  { char: '⭐', x: 200, y: 135, size: 12 },
];

export function EmptyMemoriesIllustration() {
  return (
    <View style={{ width: 240, height: 200 }}>
      <Svg width={240} height={200} viewBox="0 0 240 200" fill="none">
        {/* Background circle */}
        <Circle cx={120} cy={105} r={75} fill="#FFF9F0" />
        <Circle cx={120} cy={105} r={60} stroke="#FFD93D" strokeWidth={2} strokeDasharray="6 4" strokeOpacity={0.4} />

        {/* Cassette tape shape */}
        <Rect x={55} y={70} width={130} height={90} rx={12} fill="#6BC5F8" fillOpacity={0.2} stroke="#6BC5F8" strokeWidth={2} />
        <Rect x={70} y={85} width={100} height={60} rx={8} fill="white" fillOpacity={0.6} />

        {/* Tape reels */}
        <Circle cx={95} cy={115} r={18} fill="white" stroke="#6BC5F8" strokeWidth={2} />
        <Circle cx={95} cy={115} r={8} fill="#6BC5F8" fillOpacity={0.3} />
        <Circle cx={145} cy={115} r={18} fill="white" stroke="#6BC5F8" strokeWidth={2} />
        <Circle cx={145} cy={115} r={8} fill="#6BC5F8" fillOpacity={0.3} />
      </Svg>

      {/* Musical notes and stars */}
      {EMOJI.map((e, i) => (
        <Text
          key={i}
          style={{ position: 'absolute', left: e.x, top: e.y - e.size, fontSize: e.size, lineHeight: e.size * 1.2 }}
        >
          {e.char}
        </Text>
      ))}
    </View>
  );
}
