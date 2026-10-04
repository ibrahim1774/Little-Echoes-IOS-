import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors, shadows } from '@/lib/theme';
import { syncToCloud } from '@/services/cloudSync';
import { saveParent } from '@/services/storage';
import type { ParentProfile } from '@/types';

const PARENT_AVATARS = ['👩', '👨', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '🧑', '🧔'];

export function ParentSetup() {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('👩');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const { state, dispatch } = useApp();

  async function handleContinue() {
    if (saving) return;
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setSaving(true);

    // Coming back to this screen edits the same profile instead of adding a second one.
    const existing = state.parent;
    const parent: ParentProfile = {
      id: existing?.id ?? Crypto.randomUUID(),
      name: name.trim(),
      avatarEmoji: avatar,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      settings: existing?.settings ?? {
        reminderTime: '18:00',
        reminderDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        darkMode: false,
        questionMode: 'fresh',
        selectedQuestionIds: [],
      },
    };

    try {
      await saveParent(parent);
      dispatch({ type: 'SET_PARENT', payload: parent });
      if (state.user) void syncToCloud(state.user);
      dispatch({ type: 'SET_ONBOARDED', payload: false }); // still need child
      router.push('/setup/child');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen className="px-6 py-10">
      {/* Decorative stars */}
      <Text className="absolute top-8 left-4 text-2xl">✨</Text>
      <Text className="absolute top-10 right-6 text-xl">⭐</Text>

      <View className="flex-1 justify-center gap-8">
        <View>
          <Text className="font-nunito-extrabold text-2xl text-echo-charcoal dark:text-white">
            What should we call you?
          </Text>
          <Text className="font-nunito text-sm text-echo-gray mt-1">You're the memory keeper ❤️</Text>
        </View>

        {/* Name input */}
        <View>
          <TextInput
            testID="parent-name"
            placeholder="Your name"
            placeholderTextColor={colors.gray}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError('');
            }}
            maxLength={40}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            returnKeyType="done"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`w-full bg-white dark:bg-echo-dark-card border-2 rounded-xl px-4 py-3.5 font-nunito text-[16px] text-echo-charcoal dark:text-white ${
              focused ? 'border-echo-coral' : 'border-echo-light-gray dark:border-white/10'
            }`}
          />
          {!!error && (
            <Text testID="parent-error" className="font-nunito text-sm text-echo-coral mt-1">
              {error}
            </Text>
          )}
        </View>

        {/* Avatar picker */}
        <View>
          <Text className="font-nunito-semibold text-base text-echo-charcoal dark:text-white mb-3">Pick your avatar</Text>
          <View className="flex-row flex-wrap gap-3">
            {PARENT_AVATARS.map((emoji, i) => {
              const selected = avatar === emoji;
              return (
                <Pressable
                  key={emoji}
                  testID={`parent-avatar-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Avatar ${emoji}`}
                  accessibilityState={{ selected }}
                  onPress={() => setAvatar(emoji)}
                  className={`w-14 h-14 rounded-full bg-white dark:bg-echo-dark-card items-center justify-center active:opacity-80 ${
                    selected ? 'border-4 border-echo-coral' : ''
                  }`}
                  style={selected ? { transform: [{ scale: 1.1 }] } : shadows.soft}
                >
                  <Text className="text-2xl">{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Continue button */}
        <Pressable
          testID="parent-continue"
          accessibilityRole="button"
          onPress={() => void handleContinue()}
          disabled={saving}
          className="w-full bg-echo-coral py-4 rounded-full items-center active:opacity-80"
          style={shadows.coral}
        >
          <Text className="font-nunito-bold text-lg text-white">Continue →</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
