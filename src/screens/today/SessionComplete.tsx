import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { CATEGORY_COLORS } from '@/data/questions';
import { formatDuration } from '@/lib/logic';
import { shadows } from '@/lib/theme';
import type { Recording } from '@/types';
import { GradientBackground } from './GradientBackground';

interface Props {
  recordings: Recording[];
  childName: string;
}

const CONFETTI_COLORS = ['#FF6B6B', '#FFD93D', '#6BC5F8', '#A8E06C', '#C4A1FF', '#FF8FAB'];

interface Piece {
  id: number;
  color: string;
  left: number;
  delay: number;
  spin: number;
  size: number;
  isCircle: boolean;
}

function makePieces(): Piece[] {
  return Array.from({ length: 60 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 180),
    size: 6 + Math.random() * 10,
    isCircle: Math.random() > 0.5,
  }));
}

function ConfettiPiece({ piece, fall }: { piece: Piece; fall: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay * 1000, withTiming(1, { duration: 2500, easing: Easing.in(Easing.ease) }));
  }, [progress, piece.delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -20 + (fall + 20) * progress.value }, { rotate: `${piece.spin * progress.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: `${piece.left}%`,
          width: piece.size,
          height: piece.size,
          borderRadius: piece.isCircle ? piece.size / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

function Confetti() {
  const [pieces] = useState(makePieces);
  const { height } = useWindowDimensions();

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', zIndex: 50 }]} pointerEvents="none">
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} piece={p} fall={height} />
      ))}
    </View>
  );
}

const EMOTION_EMOJIS: Record<string, string> = {
  happy: '😄',
  silly: '🤪',
  thoughtful: '🤔',
  shy: '😊',
  excited: '🤩',
  sad: '😢',
};

export function SessionComplete({ recordings, childName }: Props) {
  const { state } = useApp();
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    contentOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
  }, [contentOpacity]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  return (
    <View className="flex-1">
      <Screen edges={['top']} className="items-center px-6 pt-16 pb-10">
        <GradientBackground />

        <Animated.View style={[{ width: '100%', alignItems: 'center' }, contentStyle]} testID="session-complete">
          {/* Hero */}
          <View className="items-center mb-8">
            <Animated.View entering={ZoomIn.delay(600).duration(600)}>
              <Text className="text-6xl mb-3">🎉</Text>
            </Animated.View>
            <Text className="font-nunito-extrabold text-3xl text-echo-charcoal dark:text-white">Amazing!</Text>
            <Text className="font-nunito text-echo-gray text-base mt-2 text-center">
              You captured {recordings.length} echo{recordings.length !== 1 ? 's' : ''} for {childName} today!
            </Text>
          </View>

          {/* Streak update */}
          {state.streak && (
            <View className="bg-echo-orange/10 rounded-xl px-5 py-3 mb-6 items-center">
              <Text className="font-nunito-bold text-base text-echo-orange">
                {state.streak.currentStreak === 1
                  ? '🌟 Your first echo!'
                  : `🔥 ${state.streak.currentStreak}-day streak!`}
              </Text>
            </View>
          )}

          {/* Summary cards */}
          <View className="w-full gap-3 mb-8">
            {recordings.map((rec, i) => (
              <Animated.View key={rec.id} entering={FadeInDown.delay(600 + i * 100).duration(400)}>
                <View
                  className="bg-white dark:bg-echo-dark-card rounded-2xl p-4 flex-row items-start gap-3"
                  style={shadows.soft}
                >
                  <View
                    className="w-2.5 h-2.5 rounded-full mt-1.5"
                    style={{ backgroundColor: CATEGORY_COLORS[rec.questionId.split('-')[0]] ?? '#8E8E93' }}
                  />
                  <View className="flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-nunito-semibold text-echo-charcoal dark:text-white text-sm leading-snug"
                    >
                      {rec.questionText}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="font-inter text-xs text-echo-gray">{formatDuration(rec.durationSeconds)}</Text>
                      {rec.emotionTag && <Text className="text-sm">{EMOTION_EMOJIS[rec.emotionTag]}</Text>}
                    </View>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* Small illustration */}
          <Text className="text-5xl mb-8">💕</Text>

          {/* Action buttons */}
          <View className="w-full gap-3">
            <Pressable
              onPress={() => router.navigate('/home')}
              accessibilityRole="button"
              testID="complete-home"
              className="w-full bg-echo-coral py-4 rounded-full items-center active:opacity-80"
              style={shadows.coral}
            >
              <Text className="font-nunito-bold text-white text-base">🏠 Back Home</Text>
            </Pressable>
            <Pressable
              onPress={() => router.navigate('/memories')}
              accessibilityRole="button"
              testID="complete-memories"
              className="w-full border-2 border-echo-coral py-4 rounded-full items-center active:opacity-80"
            >
              <Text className="font-nunito-bold text-echo-coral text-base">📖 View in Memories</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Screen>

      <Confetti />
    </View>
  );
}
