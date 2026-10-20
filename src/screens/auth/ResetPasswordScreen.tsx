import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { beginPasswordReset, clearLocalData, setNewPassword } from '@/services/auth';
import type { AuthUser } from '@/types';

import { routeAfterSignIn } from './routeAfterSignIn';

const INPUT_CLASS =
  'w-full bg-white dark:bg-echo-dark-card rounded-2xl px-4 py-3.5 font-inter text-[14px] text-echo-charcoal dark:text-white border-2';

type Phase = 'checking' | 'invalid' | 'form';

/**
 * Opened from the link in the reset email (littleechoes://reset-password?code=…).
 * Redeems the code, then asks for a new password before letting the user into the app.
 */
export function ResetPasswordScreen() {
  const { state, hydrateUser } = useApp();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [phase, setPhase] = useState<Phase>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<'password' | 'confirm' | null>(null);
  const confirmRef = useRef<TextInput>(null);
  const redeemed = useRef(false);

  useEffect(() => {
    // On a cold start from the link, wait until the saved session has loaded so we know who
    // was signed in before; redeeming the code replaces them.
    if (state.isLoading || redeemed.current) return;
    redeemed.current = true;
    const previousUserId = state.user?.id;
    if (!code) {
      setPhase('invalid');
      return;
    }
    void beginPasswordReset(code).then(async (result) => {
      if (!('user' in result)) {
        track('password_reset_link_invalid');
        setPhase('invalid');
        return;
      }
      // Another family's data must not stay on the device under this account.
      if (previousUserId && previousUserId !== result.user.id) await clearLocalData();
      setUser(result.user);
      setPhase('form');
    });
  }, [code, state.isLoading, state.user?.id]);

  async function handleSave() {
    if (saving || !user) return;
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await setNewPassword(password);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }
    track('password_reset_completed');
    let profileLoaded = false;
    try {
      ({ profileLoaded } = await hydrateUser(user));
    } catch {
      // Cloud load failed; carry on with whatever is on the device.
    }
    // The new password is saved either way; if the family couldn't load, sign-in explains it.
    const routeError = await routeAfterSignIn(user, { profileLoaded });
    if (routeError) router.replace('/signin');
  }

  if (phase === 'checking') {
    return (
      <Screen className="px-6 items-center justify-center">
        <ActivityIndicator color={colors.coral} />
        <Text className="font-inter text-sm text-echo-gray mt-3">Opening your reset link...</Text>
      </Screen>
    );
  }

  if (phase === 'invalid') {
    return (
      <Screen className="px-6 pt-12 pb-10 justify-center">
        <View className="items-center gap-2">
          <Text className="text-4xl leading-[46px] mb-1">⏳</Text>
          <Text
            testID="reset-invalid"
            className="font-nunito-extrabold text-2xl text-center text-echo-charcoal dark:text-white"
          >
            This link has expired
          </Text>
          <Text className="font-inter text-sm leading-[21px] text-center text-echo-gray">
            Reset links work once, and only on the iPhone where you asked for them. Request a new one and open it here.
          </Text>
        </View>
        <Pressable
          testID="reset-request-new"
          accessibilityRole="button"
          onPress={() => router.replace('/signin')}
          className="w-full py-4 rounded-full bg-echo-coral items-center mt-8 active:opacity-80"
          style={shadows.coral}
        >
          <Text className="font-nunito-extrabold text-base text-white">Send a new link</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen className="px-6 pt-12 pb-10">
      <View className="items-center mb-8">
        <Text className="text-4xl leading-[46px] mb-3">🔑</Text>
        <Text className="font-nunito-extrabold text-2xl text-center text-echo-charcoal dark:text-white">
          Set a new password
        </Text>
        {!!user?.email && (
          <Text testID="reset-email" className="font-inter text-sm text-center text-echo-gray mt-1">
            for {user.email}
          </Text>
        )}
      </View>

      <View className="gap-4">
        <View>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-1.5">New password</Text>
          <TextInput
            testID="reset-password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.gray}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            className={`${INPUT_CLASS} ${focused === 'password' ? 'border-echo-coral' : 'border-transparent'}`}
          />
        </View>
        <View>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-1.5">Confirm password</Text>
          <TextInput
            ref={confirmRef}
            testID="reset-confirm"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            placeholderTextColor={colors.gray}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleSave()}
            onFocus={() => setFocused('confirm')}
            onBlur={() => setFocused(null)}
            className={`${INPUT_CLASS} ${focused === 'confirm' ? 'border-echo-coral' : 'border-transparent'}`}
          />
        </View>

        {!!error && (
          <Text testID="reset-error" className="font-inter text-xs text-red-500 text-center">
            {error}
          </Text>
        )}

        <Pressable
          testID="reset-submit"
          accessibilityRole="button"
          onPress={() => void handleSave()}
          disabled={saving}
          className={`w-full py-4 rounded-full bg-echo-coral items-center mt-2 active:opacity-80 ${saving ? 'opacity-60' : ''}`}
          style={shadows.coral}
        >
          <Text className="font-nunito-extrabold text-base text-white">{saving ? 'Saving...' : 'Save new password'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
