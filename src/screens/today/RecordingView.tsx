import { useEffect, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { Pulse } from '@/components/Pulse';
import { Screen } from '@/components/Screen';
import { Waveform } from '@/components/Waveform';
import { CATEGORY_COLORS } from '@/data/questions';
import { useRecording } from '@/hooks/useRecording';
import { shadows } from '@/lib/theme';
import type { Question } from '@/types';
import { GradientBackground } from './GradientBackground';

interface Props {
  question?: Question;
  questionIndex: number;
  totalQuestions: number;
  childName: string;
  onDone: (uri: string, duration: number, mimeType: string) => void;
  /** Leave the recording step (shown when the microphone is unavailable). */
  onCancel: () => void;
  isFreeRecording?: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface BubbleSpec {
  id: number;
  size: number;
  left: number;
  delay: number;
  duration: number;
  sway: number;
  color: string;
}

// Floating background bubbles
const BUBBLES: BubbleSpec[] = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  size: 8 + Math.random() * 16,
  left: Math.random() * 100,
  delay: Math.random() * 4,
  duration: 5 + Math.random() * 5,
  sway: (Math.random() - 0.5) * 40,
  color: ['#FF6B6B', '#FFD93D', '#6BC5F8', '#C4A1FF', '#A8E06C'][i % 5],
}));

const MAX_SECONDS = 60;

function Bubble({ spec, travel }: { spec: BubbleSpec; travel: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      spec.delay * 1000,
      withRepeat(withTiming(1, { duration: spec.duration * 1000, easing: Easing.inOut(Easing.ease) }), -1, false)
    );
    return () => cancelAnimation(progress);
  }, [progress, spec]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.15, 0.2, 0]),
    transform: [{ translateY: -travel * progress.value }, { translateX: spec.sway * progress.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: -20,
          left: `${spec.left}%`,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  );
}

function ExpandingRing() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.8 * (1 - progress.value),
    transform: [{ scale: 1 + 0.5 * progress.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: '#FF6B6B' },
        style,
      ]}
    />
  );
}

export function RecordingView({
  question,
  questionIndex,
  totalQuestions,
  childName,
  onDone,
  onCancel,
  isFreeRecording,
}: Props) {
  const {
    recordingState,
    elapsedSeconds,
    audioUri,
    durationSeconds,
    mimeType,
    metering,
    error,
    permissionDenied,
    startRecording,
    stopRecording,
  } = useRecording(MAX_SECONDS);
  const { height } = useWindowDimensions();
  const delivered = useRef(false);

  const categoryColor = isFreeRecording ? '#8E8E93' : question ? CATEGORY_COLORS[question.category] : '#FF6B6B';
  const remaining = Math.max(0, MAX_SECONDS - elapsedSeconds);

  // Start recording immediately on mount
  useEffect(() => {
    // Give the previous screen's audio player a moment to release the audio
    // session; starting immediately can lose the take.
    const timer = setTimeout(() => void startRecording(), 300);
    return () => clearTimeout(timer);
  }, [startRecording]);

  // When recording stops, send the file back
  useEffect(() => {
    if (recordingState === 'stopped' && audioUri && !delivered.current) {
      delivered.current = true;
      onDone(audioUri, durationSeconds, mimeType);
    }
  }, [recordingState, audioUri, durationSeconds, mimeType, onDone]);

  if (permissionDenied) {
    return (
      <Screen edges={['top']} className="items-center justify-center px-6 pt-8 pb-6">
        <GradientBackground />
        <Text className="text-5xl mb-4">🎙️</Text>
        <Text testID="recording-error" className="font-nunito text-echo-coral text-base text-center mb-6">
          {error}
        </Text>
        <Pressable
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          testID="recording-open-settings"
          className="w-full bg-echo-coral py-4 rounded-full items-center active:opacity-80"
          style={shadows.coral}
        >
          <Text className="font-nunito-bold text-white text-base">Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          testID="recording-cancel"
          className="mt-4 py-2 active:opacity-70"
        >
          <Text className="font-nunito text-echo-gray text-sm text-center">Go Back</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} className="items-center px-6 pt-8 pb-6">
      <GradientBackground />

      {/* Floating background bubbles */}
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
        {BUBBLES.map((b) => (
          <Bubble key={b.id} spec={b} travel={height} />
        ))}
      </View>

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

      {/* Question text or free recording label */}
      {isFreeRecording ? (
        <Text className="font-nunito-semibold text-base text-echo-charcoal dark:text-white text-center mb-2 px-2">
          🎤 Custom Audio
        </Text>
      ) : question ? (
        <Text className="font-nunito-semibold text-sm text-echo-gray text-center mb-2 px-2">
          "{question.text}"
        </Text>
      ) : null}

      {!isFreeRecording && question && (
        <Text className="font-inter text-echo-gray text-xs mb-8">
          Question {questionIndex + 1} of {totalQuestions}
        </Text>
      )}

      {isFreeRecording && (
        <Text className="font-inter text-echo-gray text-xs mb-8">Record anything — up to 1 minute</Text>
      )}

      {/* Timer with countdown */}
      <View className="items-center mb-4">
        <Text
          testID="recording-timer"
          className="font-nunito-bold text-xl text-echo-charcoal dark:text-white"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatTime(elapsedSeconds)}
        </Text>
        <Text
          className={`text-xs mt-1 ${
            remaining <= 10 ? 'font-inter-semibold text-echo-coral' : 'font-inter text-echo-gray'
          }`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {remaining}s remaining
        </Text>
      </View>

      {/* Stop button (pulsing) with ring expansion effect */}
      <View className="w-[120px] h-[120px] items-center justify-center">
        {recordingState === 'recording' && <ExpandingRing />}
        <Pulse scale={1.05} duration={1500}>
          <Pressable
            onPress={() => void stopRecording()}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            testID="recording-stop"
            className="w-[120px] h-[120px] rounded-full bg-echo-coral items-center justify-center active:opacity-80"
          >
            <StopIcon />
          </Pressable>
        </Pulse>
      </View>

      <Text className="font-nunito text-echo-gray text-sm mt-6 mb-6 text-center">
        {isFreeRecording
          ? `Recording ${childName}'s voice... tap to stop`
          : `Recording ${childName}'s answer... tap to stop`}
      </Text>

      {/* Waveform visualizer */}
      <Waveform metering={metering} active={recordingState === 'recording'} />

      {error && (
        <View className="items-center mt-4">
          <Text testID="recording-error" className="text-echo-coral text-sm font-nunito text-center">
            {error}
          </Text>
          {recordingState === 'idle' && (
            <Pressable
              onPress={() => void startRecording()}
              accessibilityRole="button"
              testID="recording-retry"
              className="mt-3 px-6 py-2 rounded-full border-2 border-echo-coral active:opacity-80"
            >
              <Text className="font-nunito-bold text-echo-coral text-sm">Try Again</Text>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

function StopIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="white">
      <Rect x={6} y={6} width={12} height={12} rx={2} />
    </Svg>
  );
}
