import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Pulse } from '@/components/Pulse';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/data/questions';
import { formatDuration, isFreeRecording } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import { signOut } from '@/services/auth';
import { getQuestionsForChild, getRecordingsByChild, getStreak } from '@/services/storage';
import type { Recording } from '@/types';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function Home() {
  const { state, dispatch } = useApp();
  const insets = useSafeAreaInsets();
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const { parent, activeChild, todayQuestions, streak, user, isOnboarded } = state;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // Uploads anything pending, then clears this device.
      await signOut(user);
      router.replace('/');
    } catch {
      setSigningOut(false);
      Alert.alert('Could not sign out', 'Please check your connection and try again.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!activeChild) return;
      let cancelled = false;

      async function load(child: NonNullable<typeof activeChild>) {
        // Load questions for today
        const questions = await getQuestionsForChild(child);
        if (cancelled) return;
        dispatch({ type: 'SET_TODAY_QUESTIONS', payload: questions });

        // Load streak
        const s = await getStreak(child.id);
        if (cancelled) return;
        dispatch({ type: 'SET_STREAK', payload: s ?? null });

        // Load recent recordings
        const recs = await getRecordingsByChild(child.id);
        if (cancelled) return;
        setRecentRecordings(recs.slice(0, 3));
      }

      void load(activeChild).catch(() => {});
      return () => {
        cancelled = true;
      };
      // isOnboarded: reload once setup finishes, as on the web.
    },[activeChild, dispatch, isOnboarded])
  );

  if (signingOut) {
    return (
      <Screen scroll={false} className="items-center justify-center">
        <ActivityIndicator color={colors.coral} />
        <Text testID="home-signing-out" className="font-nunito text-echo-gray text-base mt-3">
          Signing out…
        </Text>
      </Screen>
    );
  }

  if (!parent || !activeChild) {
    return (
      <Screen scroll={false} className="items-center justify-center">
        <Text className="font-inter text-echo-gray text-base">Loading...</Text>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} className="px-4 pt-6 pb-6">
      {/* Greeting */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <View className="mb-5">
          <View className="flex-row items-center justify-between">
            <Text testID="home-greeting" className="font-nunito-bold text-2xl text-echo-charcoal dark:text-white">
              Hi, {parent.name}! 👋
            </Text>
            <Pressable
              onPress={() => setShowProfileMenu((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Profile menu"
              testID="home-profile-button"
              className="w-9 h-9 rounded-full bg-echo-coral items-center justify-center active:opacity-80"
            >
              <Text className="text-sm font-nunito-bold text-white">{parent.name.charAt(0).toUpperCase()}</Text>
            </Pressable>
          </View>
          <Text className="font-inter text-echo-gray text-sm mt-0.5">{formatDate(new Date())}</Text>
        </View>
      </Animated.View>

      {/* Profile menu */}
      <Modal
        visible={showProfileMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfileMenu(false)}
      >
        <Pressable
          className="flex-1"
          onPress={() => setShowProfileMenu(false)}
          accessibilityLabel="Close menu"
          testID="home-profile-backdrop"
        >
          <View
            className="absolute right-4 w-40 bg-white dark:bg-echo-dark-card rounded-xl overflow-hidden"
            style={[shadows.lg, { top: insets.top + 24 + 36 + 8 }]}
          >
            {user ? (
              <Pressable
                onPress={() => {
                  setShowProfileMenu(false);
                  void handleSignOut();
                }}
                accessibilityRole="button"
                testID="home-sign-out"
                className="w-full px-4 py-3 active:bg-echo-light-gray dark:active:bg-white/10"
              >
                <Text className="font-nunito text-sm text-echo-charcoal dark:text-white">Sign Out</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setShowProfileMenu(false);
                  router.push('/signin');
                }}
                accessibilityRole="button"
                testID="home-sign-in"
                className="w-full px-4 py-3 active:opacity-80"
              >
                <Text className="font-nunito text-sm text-echo-coral">Sign In</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Child selector — single child for now */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
          contentContainerClassName="gap-3 pb-2 pt-2 px-3"
        >
          {state.children.map((child) => {
            const selected = activeChild.id === child.id;
            return (
              <Pressable
                key={child.id}
                onPress={() => dispatch({ type: 'SET_ACTIVE_CHILD', payload: child })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`home-child-${child.id}`}
                className={`items-center gap-1 ${selected ? 'opacity-100' : 'opacity-50'}`}
              >
                <View
                  className={`rounded-full border-4 p-0.5 ${selected ? 'border-echo-coral' : 'border-transparent'}`}
                  style={selected ? { transform: [{ scale: 1.05 }] } : undefined}
                >
                  <View
                    className="w-16 h-16 rounded-full bg-echo-cream dark:bg-echo-dark-card items-center justify-center"
                    style={shadows.soft}
                  >
                    <Text className="text-3xl">{child.avatarEmoji}</Text>
                  </View>
                </View>
                <Text className="font-nunito-semibold text-xs text-echo-charcoal dark:text-white">{child.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Today's prompt card */}
      <Animated.View entering={FadeInDown.duration(400).delay(150)}>
        <View className="bg-white dark:bg-echo-dark-card rounded-2xl p-5 mb-4" style={shadows.soft}>
          <View className="flex-row items-center gap-2 mb-4">
            <Text className="text-2xl">{activeChild.avatarEmoji}</Text>
            <Text className="flex-1 font-nunito-bold text-echo-charcoal dark:text-white text-base">
              {activeChild.ageGroup === '1-2'
                ? `Record ${activeChild.name}'s voice`
                : `Today's questions for ${activeChild.name}`}
            </Text>
          </View>

          {activeChild.ageGroup === '1-2' ? (
            <Text className="font-inter text-echo-gray text-sm mb-5">
              Capture their little voice — babbles, first words, giggles, anything!
            </Text>
          ) : (
            /* Question previews */
            <View className="gap-2.5 mb-5">
              {todayQuestions.length > 0
                ? todayQuestions.map((q, i) => (
                    <View key={q.id} className="flex-row items-start gap-3">
                      <View
                        className="w-2.5 h-2.5 rounded-full mt-1.5"
                        style={{ backgroundColor: CATEGORY_COLORS[q.category] }}
                      />
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className="font-nunito text-echo-charcoal dark:text-white text-sm leading-snug"
                        >
                          {q.text}
                        </Text>
                        <Text className="font-inter text-echo-gray text-xs mt-0.5">{CATEGORY_LABELS[q.category]}</Text>
                      </View>
                      <Text className="font-inter-semibold text-xs text-echo-gray">Q{i + 1}</Text>
                    </View>
                  ))
                : // Loading skeleton
                  Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} className="flex-row items-start gap-3">
                      <View className="w-2.5 h-2.5 rounded-full mt-1.5 bg-echo-light-gray" />
                      <View className="flex-1 h-4 bg-echo-light-gray rounded" />
                    </View>
                  ))}
            </View>
          )}

          {/* Start recording CTA */}
          <Pulse>
            <Pressable
              onPress={() => router.navigate('/today')}
              accessibilityRole="button"
              accessibilityLabel="Start recording session"
              testID="home-start-recording"
              className="w-full bg-echo-coral py-4 rounded-full items-center justify-center active:opacity-80"
              style={shadows.coral}
            >
              <Text className="font-nunito-bold text-white text-base">🎤 Start Recording</Text>
            </Pressable>
          </Pulse>
        </View>
      </Animated.View>

      {/* Streak banner */}
      <Animated.View entering={FadeInDown.duration(400).delay(250)}>
        <View
          className="rounded-xl px-4 py-3 mb-4"
          style={{ backgroundColor: streak && streak.currentStreak > 0 ? '#FFB34715' : '#F0F0F0' }}
        >
          {streak && streak.currentStreak > 0 ? (
            <Text testID="home-streak" className="font-nunito-bold text-echo-orange text-sm">
              🔥 {streak.currentStreak}-day streak! Keep it going!
            </Text>
          ) : (
            <Text testID="home-streak" className="font-nunito text-echo-gray text-sm">
              Start your first echo today! ✨
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Recent echoes */}
      {recentRecordings.length > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Text className="font-nunito-bold text-echo-charcoal dark:text-white text-base mb-3">Recent Memories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pb-2 px-1">
            {recentRecordings.map((rec) => {
              const free = isFreeRecording(rec);
              return (
                <View
                  key={rec.id}
                  testID={`home-recent-${rec.id}`}
                  className="w-44 bg-white dark:bg-echo-dark-card rounded-2xl p-3"
                  style={shadows.soft}
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <Text className="text-xl">{activeChild.avatarEmoji}</Text>
                    <Text className="font-inter text-xs text-echo-gray">
                      {new Date(rec.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    className="font-nunito text-echo-charcoal dark:text-white text-xs leading-snug"
                  >
                    {rec.parentNote || (free ? 'Custom audio' : rec.questionText)}
                  </Text>
                  <Text className="font-inter text-echo-gray text-[10px] mb-2">
                    {free ? 'Custom audio' : 'Question of the day'}
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[rec.questionId.split('-')[0]] ?? '#8E8E93' }}
                    />
                    <Text className="font-inter text-xs text-echo-gray">{formatDuration(rec.durationSeconds)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}
    </Screen>
  );
}
