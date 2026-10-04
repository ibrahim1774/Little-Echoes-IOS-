import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { calcAgeGroup, toDateStr } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import { syncToCloud } from '@/services/cloudSync';
import { saveChild } from '@/services/storage';
import type { ChildProfile } from '@/types';

const CHILD_AVATARS = ['👧', '👦', '🧒', '👶', '🧒‍♀️', '🧒‍♂️', '🦊', '🐰', '🦄', '🐻', '🌟', '🐼'];
const CONFETTI_COLORS = ['#FF6B6B', '#FFD93D', '#6BC5F8', '#A8E06C', '#C4A1FF', '#FF8FAB'];

const INPUT_CLASS =
  'w-full bg-white dark:bg-echo-dark-card border-2 rounded-xl px-4 py-3.5 font-nunito text-[16px] text-echo-charcoal dark:text-white';
const IDLE_BORDER = 'border-echo-light-gray dark:border-white/10';

function parseDateStr(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function Confetti() {
  const { height } = useWindowDimensions();
  const pieces = useRef(
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      spin: Math.random() > 0.5 ? 360 : -360,
      size: 6 + Math.random() * 8,
      fall: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    const animation = Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.fall, {
          toValue: 1,
          duration: 2000,
          delay: p.delay * 1000,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        })
      )
    );
    animation.start();
    return () => animation.stop();
  }, [pieces]);

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <Animated.View
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            opacity: p.fall.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [-20, height] }) },
              { rotate: p.fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function AddChild() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [avatar, setAvatar] = useState('👧');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => new Date());
  const [focused, setFocused] = useState<'name' | 'school' | null>(null);
  const saving = useRef(false);
  const { state, dispatch } = useApp();

  const today = new Date();
  const minDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_ONBOARDED', payload: true });
        // The index route sends unpaid users to the paywall and everyone else home.
        if (fromSettings) router.back();
        else router.replace('/');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti, dispatch, fromSettings]);

  function togglePicker() {
    Keyboard.dismiss();
    if (!showPicker) setPickerDate(birthdate ? parseDateStr(birthdate) : new Date());
    setShowPicker((open) => !open);
  }

  function handleDateChange(_event: DateTimePickerEvent, date?: Date) {
    if (!date) return;
    setPickerDate(date);
    setBirthdate(toDateStr(date));
    setError('');
  }

  function confirmDate() {
    setBirthdate(toDateStr(pickerDate));
    setError('');
    setShowPicker(false);
  }

  async function handleAdd() {
    if (saving.current) return;
    if (!name.trim()) { setError('Please enter a name'); return; }
    if (!birthdate) { setError('Please select a birthdate'); return; }
    saving.current = true;

    const child: ChildProfile = {
      id: Crypto.randomUUID(),
      parentId: state.parent?.id ?? '',
      name: name.trim(),
      birthdate,
      ageGroup: calcAgeGroup(birthdate),
      avatarEmoji: avatar,
      schoolName: schoolName.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveChild(child);
    } catch {
      saving.current = false;
      setError('Could not save. Please try again.');
      return;
    }
    dispatch({ type: 'ADD_CHILD', payload: child });
    if (state.user) void syncToCloud(state.user);
    Keyboard.dismiss();
    setShowPicker(false);
    setShowConfetti(true);
  }

  const displayName = name.trim() || 'Your Child';
  const birthdateLabel = birthdate
    ? parseDateStr(birthdate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Select birthday';

  return (
    <Screen scroll={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6 py-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 gap-6">
          <View>
            <Text className="font-nunito-extrabold text-2xl text-echo-charcoal dark:text-white">
              Tell us about your little one
            </Text>
            <Text className="font-nunito text-sm text-echo-gray mt-1">You can add more children later in Settings.</Text>
          </View>

          {/* Name input */}
          <View>
            <Text className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white mb-1.5">Name</Text>
            <TextInput
              testID="child-name"
              placeholder="Child's name"
              placeholderTextColor={colors.gray}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError('');
              }}
              maxLength={30}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
              className={`${INPUT_CLASS} ${focused === 'name' ? 'border-echo-coral' : IDLE_BORDER}`}
            />
          </View>

          {/* Birthdate */}
          <View>
            <Text className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white mb-1.5">Birthday</Text>
            <Pressable
              testID="child-birthdate"
              accessibilityRole="button"
              accessibilityLabel={`Birthday, ${birthdateLabel}`}
              onPress={togglePicker}
              className={`w-full bg-white dark:bg-echo-dark-card border-2 rounded-xl px-4 py-3.5 active:opacity-80 ${
                showPicker ? 'border-echo-coral' : IDLE_BORDER
              }`}
            >
              <Text
                className={`font-nunito text-base ${birthdate ? 'text-echo-charcoal dark:text-white' : 'text-echo-gray'}`}
              >
                {birthdateLabel}
              </Text>
            </Pressable>
            {showPicker && (
              <View className="mt-2 bg-white dark:bg-echo-dark-card rounded-xl overflow-hidden">
                <DateTimePicker
                  testID="child-birthdate-picker"
                  value={pickerDate}
                  mode="date"
                  display="spinner"
                  maximumDate={today}
                  minimumDate={minDate}
                  themeVariant={state.darkMode ? 'dark' : 'light'}
                  onChange={handleDateChange}
                />
                <Pressable
                  testID="child-birthdate-done"
                  accessibilityRole="button"
                  onPress={confirmDate}
                  className="items-center py-3 active:opacity-80"
                >
                  <Text className="font-nunito-bold text-base text-echo-coral">Done</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Avatar picker */}
          <View>
            <Text className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white mb-2">Pick an avatar</Text>
            <View className="flex-row flex-wrap gap-y-2">
              {CHILD_AVATARS.map((emoji, i) => {
                const selected = avatar === emoji;
                return (
                  <View key={emoji} className="w-1/6 items-center">
                    <Pressable
                      testID={`child-avatar-${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Avatar ${emoji}`}
                      accessibilityState={{ selected }}
                      onPress={() => setAvatar(emoji)}
                      className={`w-12 h-12 rounded-full bg-white dark:bg-echo-dark-card items-center justify-center active:opacity-80 ${
                        selected ? 'border-4 border-echo-coral' : ''
                      }`}
                      style={selected ? { transform: [{ scale: 1.1 }] } : shadows.soft}
                    >
                      <Text className="text-2xl">{emoji}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          {/* School name (optional) */}
          <View>
            <View className="flex-row items-center gap-2 mb-1.5">
              <Text className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white">School / Daycare</Text>
              <Text className="font-nunito text-sm text-echo-gray">(optional)</Text>
            </View>
            <TextInput
              testID="child-school"
              placeholder="Skip if not applicable"
              placeholderTextColor={colors.gray}
              value={schoolName}
              onChangeText={setSchoolName}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="done"
              onFocus={() => setFocused('school')}
              onBlur={() => setFocused(null)}
              className={`${INPUT_CLASS} ${focused === 'school' ? 'border-echo-coral' : IDLE_BORDER}`}
            />
          </View>

          {!!error && (
            <Text testID="child-error" className="font-nunito text-sm text-echo-coral -mt-2">
              {error}
            </Text>
          )}

          {/* CTA button */}
          <Pressable
            testID="child-submit"
            accessibilityRole="button"
            onPress={() => void handleAdd()}
            disabled={showConfetti}
            className="w-full bg-echo-coral py-4 rounded-full items-center mt-2 active:opacity-80"
            style={shadows.coral}
          >
            <Text className="font-nunito-bold text-lg text-white">Add {displayName} 🎉</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showConfetti && <Confetti />}
    </Screen>
  );
}
