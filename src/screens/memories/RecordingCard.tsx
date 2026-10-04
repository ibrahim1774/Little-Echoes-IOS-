import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CATEGORY_COLORS } from '@/data/questions';
import { shadows } from '@/lib/theme';
import type { Recording } from '@/types';

import { AudioPlayer } from './AudioPlayer';
import { CardActions, Chevron, DurationPill } from './CardParts';
import { categoryOf, EMOTION_EMOJIS, recordingSubtitle, recordingTitle, shareRecording } from './helpers';

interface RecordingCardProps {
  rec: Recording;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const RecordingCard = memo(function RecordingCard({ rec, isOpen, onToggle, onDelete }: RecordingCardProps) {
  const catColor = CATEGORY_COLORS[categoryOf(rec)] ?? '#8E8E93';

  return (
    <View className="bg-white dark:bg-echo-dark-card rounded-2xl" style={shadows.soft}>
      <Pressable
        testID={`recording-card-${rec.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(rec.id)}
        className="flex-row items-start gap-3 p-4 active:opacity-80"
      >
        <View className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ backgroundColor: catColor }} />
        <View className="flex-1">
          <Text
            className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white leading-snug"
            numberOfLines={isOpen ? undefined : 2}
          >
            {recordingTitle(rec)}
          </Text>
          <Text className="font-inter text-xs text-echo-gray mt-0.5">{recordingSubtitle(rec)}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          {rec.emotionTag && <Text className="text-base">{EMOTION_EMOJIS[rec.emotionTag]}</Text>}
          <DurationPill seconds={rec.durationSeconds} />
          <Chevron open={isOpen} />
        </View>
      </Pressable>

      {isOpen && (
        <View className="px-4 pb-4 border-t border-echo-light-gray dark:border-white/10">
          <AudioPlayer recording={rec} />
          <CardActions kind="recording" id={rec.id} onShare={() => shareRecording(rec)} onDelete={() => onDelete(rec.id)} />
          {rec.transcription && (
            <Text className="font-nunito text-sm text-echo-gray mt-3 italic leading-relaxed">"{rec.transcription}"</Text>
          )}
          {rec.parentNote && (
            <View className="mt-2 bg-echo-cream dark:bg-echo-dark-bg rounded-lg px-3 py-2">
              <Text className="font-inter text-xs text-echo-gray">📝 {rec.parentNote}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});
