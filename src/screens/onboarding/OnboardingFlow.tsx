import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { ParentChildIllustration } from '@/components/illustrations/ParentChildIllustration';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { destinationFor } from '@/lib/routing';
import { shadows } from '@/lib/theme';
import { track } from '@/services/analytics';

const TOTAL = 6;

const EMOTION_OPTIONS = [
  { icon: '🎤', text: "The way they say 'I love you'", color: '#FF6B6B' },
  { icon: '😂', text: 'Their hilarious mispronunciations', color: '#FFD93D' },
  { icon: '📖', text: 'Story time in their little voice', color: '#6BC5F8' },
  { icon: '🎵', text: 'The songs they sing to themselves', color: '#C4A1FF' },
];

interface Shot {
  source: ImageSourcePropType;
  aspectRatio: number; // width / height of the screenshot
}

const FEATURES: (Shot & { title: string; desc: string })[] = [
  {
    source: require('../../../assets/images/IMG_3452.jpg'),
    aspectRatio: 1290 / 2386,
    title: 'Record in seconds',
    desc: 'One tap to capture their voice. We handle the rest.',
  },
  {
    source: require('../../../assets/images/IMG_3454.jpg'),
    aspectRatio: 1290 / 2368,
    title: 'Your voice time capsule',
    desc: 'Organized by age, preserved forever.',
  },
  {
    source: require('../../../assets/images/IMG_3455.jpg'),
    aspectRatio: 1290 / 2418,
    title: 'Share or keep forever',
    desc: 'Play it back years from now. Share with grandparents anytime.',
  },
];

const GROWTH_SHOT: Shot = {
  source: require('../../../assets/images/IMG_3457.png'),
  aspectRatio: 1290 / 1691,
};

const GROWTH_BULLETS = [
  'Hear their 3-year-old voice next to their 5-year-old voice',
  'Pick any time range — weekly, monthly, or yearly snapshots',
  'The app picks the best moments for you automatically',
  'A time machine for the voice you never want to forget',
];

function PhoneMockup({ shot, alt, width = 120, radius = 20 }: { shot: Shot; alt: string; width?: number; radius?: number }) {
  return (
    <View style={[shadows.soft, { width, borderRadius: radius }]} className="bg-white">
      <View className="border-2 border-echo-light-gray overflow-hidden bg-white" style={{ borderRadius: radius }}>
        <Image
          source={shot.source}
          accessibilityLabel={alt}
          resizeMode="contain"
          style={{ width: '100%', height: undefined, aspectRatio: shot.aspectRatio }}
        />
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      className="w-full bg-echo-coral py-4 rounded-full items-center active:opacity-80"
      style={shadows.coral}
    >
      <Text className="font-nunito-bold text-base text-white">{label}</Text>
    </Pressable>
  );
}

export function OnboardingFlow() {
  const { state } = useApp();
  const [screen, setScreen] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const advancing = useRef(false);

  const progress = screen / (TOTAL - 1);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function advance() {
    if (advancing.current) return;
    advancing.current = true;
    Animated.timing(fade, { toValue: 0, duration: 210, useNativeDriver: true }).start(() => {
      setScreen((s) => Math.min(s + 1, TOTAL - 1));
      advancing.current = false;
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }

  function handleEmotionSelect(index: number) {
    if (selectedEmotion !== null) return;
    setSelectedEmotion(index);
    timers.current.push(setTimeout(advance, 400));
  }

  // After the intro, hand off to account creation; signed-in users resume setup.
  function finish() {
    track('onboarding_completed');
    if (!state.user) router.push('/signup');
    else router.replace(destinationFor(state));
  }

  const feat = screen >= 2 && screen <= 4 ? FEATURES[screen - 2] : undefined;

  return (
    <Screen scroll={false}>
      {/* Progress bar */}
      <View className="h-1 bg-echo-light-gray">
        <Animated.View
          className="h-full bg-echo-coral"
          style={{ width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6 pt-12 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          className="flex-1 items-center"
          style={{
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }}
        >
          {/* ── SCREEN 1: Emotional Hook ── */}
          {screen === 0 && (
            <View className="flex-1 w-full items-center justify-center gap-5">
              <ParentChildIllustration />

              <View className="max-w-xs gap-3">
                <Text className="font-nunito-extrabold text-[28px] leading-[35px] text-center text-echo-charcoal dark:text-white">
                  Their little voice won't sound like this forever.
                </Text>
                <Text className="font-nunito text-base leading-[26px] text-center text-echo-gray">
                  LittleEchoes preserves your child's voice — every funny word, every sweet giggle — so you can hear it
                  again in 10, 20, even 50 years.
                </Text>
              </View>

              <View className="w-full mt-4">
                <PrimaryButton testID="onboarding-start" label="Start Saving Memories →" onPress={advance} />
              </View>

              <View className="flex-row items-center justify-center">
                <Text className="font-inter text-xs text-echo-gray">Already have an account? </Text>
                <Pressable
                  testID="onboarding-signin"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => router.push('/signin')}
                  className="active:opacity-80"
                >
                  <Text className="font-inter-semibold text-xs text-echo-coral">Sign in</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── SCREEN 2: Emotional Question ── */}
          {screen === 1 && (
            <View className="flex-1 w-full gap-6 pt-4">
              <Text className="font-nunito-extrabold text-[24px] leading-[30px] text-center text-echo-charcoal dark:text-white">
                What moment do you wish you could keep forever?
              </Text>

              <View className="w-full gap-3">
                {EMOTION_OPTIONS.map((opt, i) => {
                  const isSelected = selectedEmotion === i;
                  const isDimmed = selectedEmotion !== null && selectedEmotion !== i;
                  return (
                    <Pressable
                      key={opt.text}
                      testID={`onboarding-emotion-${i}`}
                      accessibilityRole="button"
                      onPress={() => handleEmotionSelect(i)}
                      className="w-full flex-row items-center gap-4 bg-white dark:bg-echo-dark-card rounded-2xl p-4 border-2 active:opacity-80"
                      style={[
                        shadows.soft,
                        {
                          borderColor: isSelected ? opt.color : 'transparent',
                          opacity: isDimmed ? 0.4 : 1,
                          transform: [{ scale: isSelected ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      <View
                        className="w-12 h-12 rounded-xl items-center justify-center"
                        style={{ backgroundColor: opt.color + '22' }}
                      >
                        <Text className="text-2xl">{opt.icon}</Text>
                      </View>
                      <Text className="flex-1 font-nunito-semibold text-[15px] leading-[21px] text-echo-charcoal dark:text-white">
                        {opt.text}
                      </Text>
                      {isSelected && (
                        <View
                          className="w-6 h-6 rounded-full items-center justify-center"
                          style={{ backgroundColor: opt.color }}
                        >
                          <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                            <Path d="M2 6l3 3 5-5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── SCREENS 3–5: Feature Pages ── */}
          {feat && (
            <View className="flex-1 w-full items-center gap-5 pt-2">
              <Text className="font-nunito-bold text-xs text-echo-coral uppercase tracking-wider">
                Step {screen - 1} of 3
              </Text>
              <PhoneMockup shot={feat} alt={feat.title} width={220} />
              <View className="max-w-xs gap-2">
                <Text className="font-nunito-extrabold text-[22px] leading-[28px] text-center text-echo-charcoal dark:text-white">
                  {feat.title}
                </Text>
                <Text className="font-inter text-sm leading-[23px] text-center text-echo-gray">{feat.desc}</Text>
              </View>
              <View className="mt-auto pt-3 w-full">
                <PrimaryButton testID="onboarding-continue" label="Tap to Continue" onPress={advance} />
              </View>
            </View>
          )}

          {/* ── SCREEN 6: Growth Showcase ── */}
          {screen === 5 && (
            <View className="flex-1 w-full items-center gap-4 pt-2">
              <View className="max-w-xs gap-2">
                <Text className="font-nunito-extrabold text-[24px] leading-[30px] text-center text-echo-charcoal dark:text-white">
                  Hear them grow up.{'\n'}One voice at a time.
                </Text>
                <Text className="font-inter text-sm leading-[23px] text-center text-echo-gray">
                  Play back their voice from 6 months ago. Then today. The difference will give you chills.
                </Text>
              </View>

              <PhoneMockup shot={GROWTH_SHOT} alt="Voice Growth Timeline" width={180} radius={24} />

              <View className="w-full gap-2.5">
                {GROWTH_BULLETS.map((b) => (
                  <View key={b} className="flex-row items-start gap-2.5">
                    <View className="w-5 h-5 rounded-full bg-echo-coral/15 items-center justify-center mt-0.5">
                      <Svg width={10} height={10} viewBox="0 0 12 12" fill="none">
                        <Path d="M2 6l3 3 5-5" stroke="#FF6B6B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                    <Text className="flex-1 font-inter text-xs leading-[17px] text-echo-charcoal dark:text-white">{b}</Text>
                  </View>
                ))}
              </View>

              <View className="mt-auto pt-3 w-full">
                <PrimaryButton testID="onboarding-finish" label="Continue →" onPress={finish} />
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
