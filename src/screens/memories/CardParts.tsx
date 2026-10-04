import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { formatDuration } from '@/lib/logic';
import { colors } from '@/lib/theme';

export function Chevron({ open }: { open: boolean }) {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.gray}
      strokeWidth={2}
      style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
    >
      <Path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DurationPill({ seconds }: { seconds: number }) {
  return (
    <View className="bg-echo-sky/15 px-2 py-0.5 rounded-full">
      <Text className="font-inter text-xs text-echo-sky">{seconds ? formatDuration(seconds) : '—'}</Text>
    </View>
  );
}

/** Download (share sheet) and delete row shared by recording and video cards. */
export function CardActions({
  kind,
  id,
  onShare,
  onDelete,
}: {
  kind: 'recording' | 'video';
  id: string;
  onShare: () => Promise<void>;
  onDelete: () => void;
}) {
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      await onShare();
    } finally {
      setSharing(false);
    }
  }

  function confirmDelete() {
    Alert.alert(`Delete this ${kind}? This cannot be undone.`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <View className="mt-2 flex-row items-center gap-4">
      <Pressable
        testID={`${kind}-download-${id}`}
        accessibilityRole="button"
        accessibilityLabel={`Download ${kind}`}
        onPress={() => void handleShare()}
        hitSlop={8}
        className="flex-row items-center gap-1.5 active:opacity-80"
      >
        {sharing ? (
          <ActivityIndicator size="small" color={colors.gray} style={{ width: 14, height: 14, transform: [{ scale: 0.7 }] }} />
        ) : (
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <Polyline points="7 10 12 15 17 10" />
            <Line x1={12} y1={15} x2={12} y2={3} />
          </Svg>
        )}
        <Text className="font-inter text-xs text-echo-gray">Download</Text>
      </Pressable>
      <Pressable
        testID={`${kind}-delete-${id}`}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${kind}`}
        onPress={confirmDelete}
        hitSlop={8}
        className="flex-row items-center gap-1.5 active:opacity-80"
      >
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="3 6 5 6 21 6" />
          <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </Svg>
        <Text className="font-inter text-xs text-echo-gray">Delete</Text>
      </Pressable>
    </View>
  );
}

export function DayHeading({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      <Text className="text-xl">{emoji}</Text>
      <Text className="font-nunito-bold text-sm text-echo-charcoal dark:text-white">{label}</Text>
    </View>
  );
}

export function EmptyNote({ emoji, text, className = 'py-12 gap-3 px-4' }: { emoji: string; text: string; className?: string }) {
  return (
    <View className={`items-center ${className}`}>
      <Text className="text-4xl">{emoji}</Text>
      <Text className="font-nunito text-echo-gray text-sm text-center">{text}</Text>
    </View>
  );
}
