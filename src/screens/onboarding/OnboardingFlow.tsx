import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { ParentChildIllustration } from '@/components/illustrations/ParentChildIllustration';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { destinationFor } from '@/lib/routing';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { requestNotificationPermission } from '@/services/notifications';
import { getOnboardingAnswers, saveOnboardingAnswers } from '@/services/onboardingAnswers';

import {
  EVERY_DAY,
  PAIN_FORGOTTEN,
  PAIN_FUTURE,
  PAIN_GROWING,
  PAIN_PHASE,
  REMINDER_TIMES,
  withName,
  type PainQuestion,
} from './content';
import { DemoClip, type Callout } from './DemoClip';

/** hook, 3 pains, name, 4 demos, reminder, future — then the paywall. */
const STEPS = ['hook', 'growing', 'forgotten', 'phase', 'name', 'audio', 'video', 'timeline', 'growth', 'reminder', 'future'] as const;
type Step = (typeof STEPS)[number];

const PAINS: Partial<Record<Step, PainQuestion>> = {
  growing: PAIN_GROWING,
  forgotten: PAIN_FORGOTTEN,
  phase: PAIN_PHASE,
  future: PAIN_FUTURE,
};

interface Demo {
  title: string;
  subtitle: string;
  badge?: string;
  video: number;
  poster: number;
  callouts: Callout[];
}

// Screen recordings of the real app (assets/onboarding), captured at 590×1282.
const CLIP_ASPECT = 590 / 1282;
const DEMOS: Partial<Record<Step, Demo>> = {
  audio: {
    title: "Record {name}'s voice in 10 seconds.",
    subtitle: 'A new question every day. One tap to record their answer.',
    video: require('../../../assets/onboarding/demo-audio.mp4'),
    poster: require('../../../assets/onboarding/demo-audio.jpg'),
    callouts: [
      { from: 0, to: 3, text: "1  Today's question", top: 0.3 },
      { from: 3, to: 8, text: '2  Tap once to record', top: 0.2, side: 'right' },
      { from: 8, to: 12, text: '3  Saved. Next question!', top: 0.6 },
    ],
  },
  video: {
    title: 'Add the face behind the voice.',
    subtitle: 'A 15-second video a day, next to their voice.',
    badge: 'Included with Pro',
    video: require('../../../assets/onboarding/demo-video.mp4'),
    poster: require('../../../assets/onboarding/demo-video.jpg'),
    callouts: [
      { from: 0, to: 4.5, text: "1  Today's 15-second clip", top: 0.12 },
      { from: 4.5, to: 9, text: '2  Watch it any time', top: 0.3, side: 'right' },
    ],
  },
  timeline: {
    title: 'Every memory, sorted by age.',
    subtitle: 'Scroll back through every day you saved.',
    video: require('../../../assets/onboarding/demo-timeline.mp4'),
    poster: require('../../../assets/onboarding/demo-timeline.jpg'),
    callouts: [
      { from: 0, to: 3, text: '1  Every day you recorded', top: 0.22 },
      { from: 3, to: 11.5, text: '2  Months of memories, one scroll', top: 0.5, side: 'right' },
    ],
  },
  growth: {
    title: 'Hear {name} grow up.',
    subtitle: 'Play their voice from months ago next to today. It gives you chills.',
    video: require('../../../assets/onboarding/demo-growth.mp4'),
    poster: require('../../../assets/onboarding/demo-growth.jpg'),
    callouts: [
      { from: 0, to: 2.5, text: '1  Pick a time range', top: 0.15 },
      { from: 2.5, to: 12, text: '2  Hear them grow, month by month', top: 0.42, side: 'right' },
    ],
  },
};

function PrimaryButton({ label, onPress, testID, disabled }: { label: string; onPress: () => void; testID: string; disabled?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`w-full py-4 rounded-full bg-echo-coral items-center active:opacity-80 ${disabled ? 'opacity-40' : ''}`}
      style={disabled ? undefined : shadows.coral}
    >
      <Text className="font-nunito-bold text-base text-white">{label}</Text>
    </Pressable>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <Text className="font-nunito-extrabold text-[24px] leading-[30px] text-center text-echo-charcoal dark:text-white">
      {children}
    </Text>
  );
}

/** A question with four answers; picking one moves the flow on. */
function PainScreen({
  question,
  name,
  selected,
  onSelect,
}: {
  question: PainQuestion;
  name: string;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="flex-1 w-full gap-5 pt-2">
      <Title>{withName(question.title, name)}</Title>
      <View className="w-full gap-3">
        {question.choices.map((c, i) => {
          const isSelected = c.id === selected;
          return (
            <Pressable
              key={c.id}
              testID={`onboarding-${question.id}-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(c.id)}
              className={`w-full flex-row items-center gap-3 bg-white dark:bg-echo-dark-card rounded-2xl px-4 py-4 border-2 active:opacity-90 ${
                isSelected ? 'border-echo-coral' : 'border-transparent'
              }`}
              style={shadows.soft}
            >
              <View
                className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                  isSelected ? 'bg-echo-coral border-echo-coral' : 'border-echo-light-gray'
                }`}
              >
                {isSelected && (
                  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                    <Path d="M2 6l3 3 5-5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <Text className="flex-1 font-nunito-semibold text-[15px] leading-[21px] text-echo-charcoal dark:text-white">
                {c.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OnboardingFlow() {
  const { state } = useApp();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [childName, setChildName] = useState('');
  const [pains, setPains] = useState<Record<string, string>>({});
  // Nothing starts selected: only the answer tapped on this screen shows a tick, then we move on.
  const [picked, setPicked] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const moving = useRef(false);
  // Picking an answer moves on once the tick has shown; one pending move at a time.
  const autoAdvance = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoAdvance.current) clearTimeout(autoAdvance.current);
  }, []);

  const step = STEPS[index];
  const name = childName.trim();

  // The name survives leaving and coming back (e.g. from sign-in); answers are asked afresh.
  useEffect(() => {
    void getOnboardingAnswers().then((a) => {
      if (a.childName) setChildName(a.childName);
      if (a.pains) setPains(a.pains);
    });
  }, []);

  useEffect(() => setPicked(null), [index]);

  // A subscriber who never finished signing up (or reinstalled) goes to make their account.
  useEffect(() => {
    if (state.isPaid && !state.user) router.replace('/signup');
  }, [state.isPaid, state.user]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: index / (STEPS.length - 1),
      duration: 450,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [index, progressAnim]);

  function go(delta: 1 | -1) {
    if (delta === -1 && autoAdvance.current) {
      clearTimeout(autoAdvance.current);
      autoAdvance.current = null;
    }
    if (moving.current) return;
    const next = index + delta;
    if (next < 0 || next >= STEPS.length) return;
    moving.current = true;
    Keyboard.dismiss();
    Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setIndex(next);
      moving.current = false;
      if (delta === 1) track('onboarding_step', { step: STEPS[next], index: next });
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }

  function choosePain(questionId: string, choiceId: string) {
    if (autoAdvance.current) return;
    setPicked(choiceId);
    const next = { ...pains, [questionId]: choiceId };
    setPains(next);
    void saveOnboardingAnswers({ pains: next });
    track('onboarding_answer', { question: questionId, answer: choiceId });
    autoAdvance.current = setTimeout(() => {
      autoAdvance.current = null;
      if (questionId === PAIN_FUTURE.id) finish();
      else go(1);
    }, 500);
  }

  function saveName() {
    void saveOnboardingAnswers({ childName: name || undefined });
    go(1);
  }

  function chooseReminder(time: string) {
    // The pending ref stays set until we've moved on, so a second tap (e.g. behind the permission dialog) is ignored.
    if (autoAdvance.current) return;
    setPicked(time);
    autoAdvance.current = setTimeout(() => {
      void (async () => {
        await saveOnboardingAnswers({ reminderTime: time, reminderDays: EVERY_DAY });
        // Asked here, where the reason is on screen. Declining just means no reminders.
        const granted = await requestNotificationPermission().catch(() => false);
        track('onboarding_reminder', { time, days: EVERY_DAY.length, granted });
        autoAdvance.current = null;
        go(1);
      })();
    }, 500);
  }

  function finish() {
    track('onboarding_completed');
    setPicked(null); // coming back from the paywall shows the question untouched
    // New users choose a plan before making an account; anyone signed in carries on where they were.
    if (!state.user) router.push('/paywall');
    else router.replace(destinationFor(state));
  }

  const pain = PAINS[step];
  const demo = DEMOS[step];
  const clipWidth = Math.min(width * 0.58, 250);

  return (
    <Screen scroll={false}>
      {/* Progress bar and back */}
      {index > 0 && (
        <View className="flex-row items-center gap-3 px-4 pt-2">
          <Pressable
            testID="onboarding-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            onPress={() => go(-1)}
            className="p-1 active:opacity-70"
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
          </Pressable>
          <View className="flex-1 h-1.5 rounded-full bg-echo-light-gray overflow-hidden">
            <Animated.View
              className="h-full bg-echo-coral rounded-full"
              style={{ width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
            />
          </View>
        </View>
      )}

      <ScrollView
        contentContainerClassName="grow px-6 pt-6 pb-8"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          className="flex-1"
          style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
        >
          {step === 'hook' && (
            <View className="flex-1 w-full items-center justify-center gap-5 pt-6">
              <ParentChildIllustration />
              <View className="max-w-xs gap-3">
                <Text className="font-nunito-extrabold text-[28px] leading-[35px] text-center text-echo-charcoal dark:text-white">
                  Their little voice won&apos;t sound like this forever.
                </Text>
                <Text className="font-nunito text-base leading-[26px] text-center text-echo-gray">
                  LittleEchoes keeps your child&apos;s voice, every funny word and every giggle, so you can hear it again in 10, 20,
                  even 50 years.
                </Text>
              </View>
              <View className="w-full mt-4 gap-3">
                <PrimaryButton testID="onboarding-start" label="Start Saving Memories →" onPress={() => go(1)} />
                <Pressable
                  testID="onboarding-signin"
                  accessibilityRole="button"
                  onPress={() => router.push('/signin')}
                  className="w-full py-3.5 rounded-full border-2 border-echo-coral items-center active:opacity-80"
                >
                  <Text className="font-nunito-bold text-base text-echo-coral">I already have an account</Text>
                </Pressable>
              </View>
            </View>
          )}

          {pain && (
            <PainScreen
              question={pain}
              name={name}
              selected={picked ?? undefined}
              onSelect={(id) => choosePain(pain.id, id)}
            />
          )}

          {step === 'name' && (
            <View className="flex-1 w-full gap-5 pt-6">
              <Title>Who are we saving memories for?</Title>
              <Text className="font-inter text-sm text-center text-echo-gray">Just their first name. You can add more children later.</Text>
              <View className="w-full rounded-2xl bg-white dark:bg-echo-dark-card" style={shadows.soft}>
              <TextInput
                testID="onboarding-child-name"
                value={childName}
                onChangeText={setChildName}
                placeholder="Their first name"
                placeholderTextColor={colors.gray}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="givenName"
                returnKeyType="next"
                onSubmitEditing={saveName}
                maxLength={30}
                className="w-full px-5 py-4 font-nunito-bold text-[20px] text-center text-echo-charcoal dark:text-white"
              />
              </View>
              <View className="mt-auto pt-3 w-full gap-3">
                <PrimaryButton testID="onboarding-continue" label="Continue" onPress={saveName} disabled={!name} />
                <Pressable testID="onboarding-name-skip" accessibilityRole="button" onPress={saveName} className="self-center p-2">
                  <Text className="font-inter text-sm text-echo-gray">Skip for now</Text>
                </Pressable>
              </View>
            </View>
          )}

          {demo && (
            <View className="flex-1 w-full items-center gap-4">
              {demo.badge && (
                <View className="bg-echo-lavender/20 rounded-full px-3 py-1">
                  <Text className="font-nunito-bold text-xs text-echo-lavender">{demo.badge}</Text>
                </View>
              )}
              <View className="gap-2 max-w-xs">
                <Title>{withName(demo.title, name)}</Title>
                <Text className="font-inter text-sm leading-[21px] text-center text-echo-gray">{demo.subtitle}</Text>
              </View>
              <DemoClip
                testID={`onboarding-demo-${step}`}
                video={demo.video}
                poster={demo.poster}
                aspectRatio={CLIP_ASPECT}
                width={clipWidth}
                callouts={demo.callouts}
              />
              <View className="mt-auto pt-3 w-full">
                <PrimaryButton testID="onboarding-continue" label="Continue" onPress={() => go(1)} />
              </View>
            </View>
          )}

          {step === 'reminder' && (
            <View className="flex-1 w-full gap-5 pt-2">
              <Title>When should we remind you?</Title>
              <Text className="font-inter text-sm text-center text-echo-gray">
                A gentle daily nudge with a question to ask {name || 'your little one'}. Ten seconds is enough.
              </Text>
              <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
                {REMINDER_TIMES.map((r) => {
                  const on = r.time === picked;
                  return (
                    <Pressable
                      key={r.time}
                      testID={`onboarding-reminder-${r.time}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => chooseReminder(r.time)}
                      className={`bg-white dark:bg-echo-dark-card rounded-2xl py-4 items-center gap-1 border-2 ${
                        on ? 'border-echo-coral' : 'border-transparent'
                      }`}
                      style={[shadows.soft, { width: '48%' }]}
                    >
                      <Text className="text-2xl">{r.icon}</Text>
                      <Text className="font-nunito-bold text-sm text-echo-charcoal dark:text-white">{r.label}</Text>
                      <Text className="font-inter text-xs text-echo-gray">{formatTime(r.time)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}
