import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

const BAR_COUNT = 30;
const SAMPLE_MS = 80;
const FLOOR_DB = -60;

/** Bar colour for position 0..1: coral fading to lavender, as on the web. */
export function waveformColor(progress: number): string {
  const r = Math.round(255 * (1 - progress) + 196 * progress);
  const g = Math.round(107 * (1 - progress) + 161 * progress);
  const b = Math.round(107 * (1 - progress) + 255 * progress);
  return `rgb(${r},${g},${b})`;
}

function normalise(db: number | null): number {
  if (db == null || !isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
}

interface Props {
  /** Input level in dB (about -160..0), or null when unavailable. */
  metering: number | null;
  active: boolean;
}

/** Live level meter: a rolling history of recent input levels, newest on the right. */
export function Waveform({ metering, active }: Props) {
  const [bars, setBars] = useState<number[]>(() => Array<number>(BAR_COUNT).fill(0));
  const latest = useRef<number | null>(metering);
  latest.current = metering;

  useEffect(() => {
    // When inactive, keep the last frozen state (don't reset to zero).
    if (!active) return;
    const id = setInterval(() => {
      setBars((prev) => [...prev.slice(1), normalise(latest.current)]);
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [active]);

  return (
    <View className="flex-row items-center gap-[2px] h-16" testID="recording-waveform">
      {bars.map((level, i) => (
        <View
          key={i}
          className="w-[4px] rounded-full"
          style={{
            height: `${Math.max(4, Math.round(level * 100))}%`,
            minHeight: 4,
            backgroundColor: waveformColor(i / (BAR_COUNT - 1)),
          }}
        />
      ))}
    </View>
  );
}
