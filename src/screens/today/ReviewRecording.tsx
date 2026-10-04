import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/Screen';
import { waveformColor } from '@/components/Waveform';
import { CATEGORY_COLORS } from '@/data/questions';
import { formatDuration } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import type { Question, Recording } from '@/types';
import { GradientBackground } from './GradientBackground';

interface Props {
  question?: Question;
  questionIndex: number;
  totalQuestions: number;
  uri: string;
  duration: number;
  onReRecord: () => void;
  onNext: (
    uri: string,
    duration: number,
    emotionTag?: Recording['emotionTag'],
    parentNote?: string
  ) => Promise<void>;
  isFreeRecording?: boolean;
}

const EMOTIONS: { tag: NonNullable<Recording['emotionTag']>; emoji: string; label: string; color: string }[] = [
  { tag: 'happy', emoji: '😄', label: 'Happy', color: '#FFD93D' },
  { tag: 'silly', emoji: '🤪', label: 'Silly', color: '#FF8FAB' },
  { tag: 'thoughtful', emoji: '🤔', label: 'Thoughtful', color: '#6BC5F8' },
  { tag: 'shy', emoji: '😊', label: 'Shy', color: '#A8E06C' },
  { tag: 'excited', emoji: '🤩', label: 'Excited', color: '#FF6B6B' },
  { tag: 'sad', emoji: '😢', label: 'Sad', color: '#C4A1FF' },
];

// Frozen waveform — just decorative bars
const FROZEN_BARS = Array.from({ length: 30 }, (_, i) => {
  const wave = Math.sin((i / 29) * Math.PI * 4) * 0.5 + 0.5;
  return Math.max(8, Math.round(wave * 70));
});

export function ReviewRecording({
  question,
  questionIndex,
  totalQuestions,
  uri,
  duration,
  onReRecord,
  onNext,
  isFreeRecording,
}: Props) {
  const [selectedEmotion, setSelectedEmotion] = useState<Recording['emotionTag']>(undefined);
  const [parentNote, setParentNote] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  const categoryColor = isFreeRecording ? '#8E8E93' : question ? CATEGORY_COLORS[question.category] : '#FF6B6B';
  const isLast = isFreeRecording || questionIndex >= totalQuestions - 1;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Rewind when playback ends so it can be played again.
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0).catch(() => {});
  }, [status.didJustFinish, player]);

  async function togglePlayback() {
    if (isPlaying) {
      player.pause();
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (status.duration > 0 && status.currentTime >= status.duration) await player.seekTo(0);
      player.play();
    } catch {
      // playback unavailable — leave the button in its paused state
    }
  }

  function pausePlayback() {
    try {
      player.pause();
    } catch {
      // player already released
    }
  }

  async function handleNext() {
    if (saving) return;
    pausePlayback();
    setSaving(true);
    try {
      await onNext(uri, duration, selectedEmotion, parentNote.trim() || undefined);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  function handleReRecord() {
    if (saving) return;
    pausePlayback();
    onReRecord();
  }

  const totalSeconds = status.duration > 0 ? status.duration : duration;

  return (
    <Screen edges={['top']} className="px-6 pt-12 pb-10">
      <GradientBackground />

      {/* Progress */}
      {!isFreeRecording && (
        <View className="flex-row gap-2 mb-6">
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === questionIndex ? 'w-10' : 'w-6 opacity-30'}`}
              style={{ backgroundColor: i <= questionIndex ? categoryColor : '#F0F0F0' }}
            />
          ))}
        </View>
      )}

      {/* Question or free recording label */}
      <Text className="font-nunito-semibold text-sm text-echo-gray text-center mb-1">
        {isFreeRecording ? '🎤 Custom Audio' : question ? `"${question.text}"` : ''}
      </Text>

      {/* Duration badge */}
      <View className="flex-row justify-center mb-6">
        <View className="bg-echo-sky/20 px-3 py-1 rounded-full">
          <Text testID="review-duration" className="font-inter-semibold text-xs text-echo-sky">
            {formatDuration(duration)}
          </Text>
        </View>
      </View>

      {/* Playback area */}
      <View className="items-center gap-4 mb-6">
        {/* Frozen waveform */}
        <View className="flex-row items-center gap-[2px] h-12">
          {FROZEN_BARS.map((height, i) => (
            <View
              key={i}
              className="w-[4px] rounded-full"
              style={{
                height: `${height}%`,
                backgroundColor: waveformColor(i / (FROZEN_BARS.length - 1)),
                opacity: isPlaying ? 1 : 0.6,
              }}
            />
          ))}
        </View>

        {/* Play/Pause button */}
        <Pressable
          onPress={() => void togglePlayback()}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause playback' : 'Play recording'}
          testID="review-play"
          className="w-14 h-14 rounded-full bg-echo-sky items-center justify-center active:opacity-80"
          style={shadows.soft}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Pressable>

        <Text
          testID="review-position"
          className="font-inter text-xs text-echo-gray"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatDuration(Math.min(status.currentTime, totalSeconds))} / {formatDuration(totalSeconds)}
        </Text>
      </View>

      {/* Emotion tag picker */}
      <View className="mb-5">
        <Text className="font-nunito-semibold text-echo-charcoal dark:text-white text-sm mb-3 text-center">
          How was this answer? <Text className="font-nunito text-echo-gray">(optional)</Text>
        </Text>
        <View className="flex-row flex-wrap justify-center gap-2">
          {EMOTIONS.map(({ tag, emoji, label, color }) => {
            const selected = selectedEmotion === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => setSelectedEmotion(selected ? undefined : tag)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`review-emotion-${tag}`}
                className={`px-3 py-1.5 rounded-full active:opacity-80 ${
                  selected ? '' : 'bg-white dark:bg-echo-dark-card'
                }`}
                style={selected ? { backgroundColor: color, transform: [{ scale: 1.05 }] } : shadows.soft}
              >
                <Text
                  className={`font-nunito-semibold text-sm ${
                    selected ? 'text-white' : 'text-echo-charcoal dark:text-white'
                  }`}
                >
                  {emoji} {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Parent note */}
      <View className="mb-6">
        <TextInput
          testID="review-note"
          placeholder="Add a note (optional) — e.g. 'told the funniest story about his friend'"
          placeholderTextColor={colors.gray}
          value={parentNote}
          onChangeText={setParentNote}
          multiline
          numberOfLines={2}
          maxLength={300}
          textAlignVertical="top"
          className="w-full bg-white dark:bg-echo-dark-card border-2 border-echo-light-gray dark:border-white/10 focus:border-echo-coral rounded-xl px-4 py-3 font-nunito text-sm text-echo-charcoal dark:text-white"
          style={{ minHeight: 68 }}
        />
      </View>

      {/* Actions */}
      <View className="gap-3">
        <Pressable
          onPress={() => void handleNext()}
          disabled={saving}
          accessibilityRole="button"
          testID="review-next"
          className={`w-full bg-echo-coral py-4 rounded-full items-center active:opacity-80 ${
            saving ? 'opacity-60' : ''
          }`}
          style={shadows.coral}
        >
          <Text className="font-nunito-bold text-white text-base">
            {isFreeRecording ? '✨ Save Recording' : isLast ? '✨ Finish Session' : 'Next Question →'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleReRecord}
          disabled={saving}
          accessibilityRole="button"
          testID="review-rerecord"
          className="py-1 active:opacity-70"
        >
          <Text className="font-nunito text-echo-gray text-sm text-center">🔄 Re-record</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function PlayIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="white">
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

function PauseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="white">
      <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </Svg>
  );
}
