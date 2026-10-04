import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';

import { shadows } from '@/lib/theme';
import type { VideoClip } from '@/types';

import { CardActions, Chevron, DurationPill } from './CardParts';
import { shareVideo } from './helpers';
import { VideoPlayer } from './VideoPlayer';

interface VideoCardProps {
  clip: VideoClip;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const VideoCard = memo(function VideoCard({ clip, isOpen, onToggle, onDelete }: VideoCardProps) {
  return (
    <View className="bg-white dark:bg-echo-dark-card rounded-2xl" style={shadows.soft}>
      <Pressable
        testID={`video-card-${clip.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(clip.id)}
        className="flex-row items-start gap-3 p-4 active:opacity-80"
      >
        <View className="w-6 h-6 mt-0.5 items-center justify-center rounded-full bg-echo-sky/15">
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#4A90D9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Polygon points="23 7 16 12 23 17 23 7" />
            <Rect x={1} y={5} width={15} height={14} rx={2} ry={2} />
          </Svg>
        </View>
        <View className="flex-1">
          <Text
            className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white leading-snug"
            numberOfLines={isOpen ? undefined : 2}
          >
            {clip.caption || 'Video clip'}
          </Text>
          <Text className="font-inter text-xs text-echo-gray mt-0.5">Video</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <DurationPill seconds={clip.durationSeconds} />
          <Chevron open={isOpen} />
        </View>
      </Pressable>

      {isOpen && (
        <View className="px-4 pb-4 border-t border-echo-light-gray dark:border-white/10">
          <View className="mt-3">
            <VideoPlayer clip={clip} />
          </View>
          <CardActions kind="video" id={clip.id} onShare={() => shareVideo(clip)} onDelete={() => onDelete(clip.id)} />
        </View>
      )}
    </View>
  );
});
