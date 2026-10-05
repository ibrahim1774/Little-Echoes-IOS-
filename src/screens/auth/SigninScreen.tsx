import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { AppleButton } from '@/components/auth/AppleButton';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { isGoogleConfigured, signInWithApple, signInWithEmail, signInWithGoogle, type AuthResult } from '@/services/auth';
import { getChildren, getParent } from '@/services/storage';
import { supabase } from '@/services/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_CLASS =
  'w-full bg-white dark:bg-echo-dark-card rounded-2xl px-4 py-3.5 font-inter text-[14px] text-echo-charcoal dark:text-white border-2';

export function SigninScreen() {
  const { state, hydrateUser } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function completeAuth(result: AuthResult) {
    if ('cancelled' in result) {
      setLoading(false);
      return;
    }
    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Load cloud data onto this device
    try {
      await hydrateUser(result.user);
    } catch {
      // Cloud load failed; carry on with whatever is on the device.
    }
    track(result.isNewUser ? 'sign_up' : 'sign_in');

    // Route: no profile → setup; otherwise the index route picks paywall or home.
    const parent = await getParent();
    const kids = parent ? await getChildren(parent.id) : [];
    if (!parent) router.replace('/setup/parent');
    else if (kids.length === 0) router.replace('/setup/child');
    else router.replace('/');
  }

  async function handleSignin() {
    if (loading) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setLoading(true);
    setError('');
    setResetSent(false);
    await completeAuth(await signInWithEmail(email, password));
  }

  async function handleApple() {
    if (loading) return;
    setLoading(true);
    setError('');
    await completeAuth(await signInWithApple());
  }

  async function handleGoogle() {
    if (loading) return;
    setLoading(true);
    setError('');
    setResetSent(false);
    await completeAuth(await signInWithGoogle());
  }

  async function handleForgotPassword() {
    setResetSent(false);
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter your email address above first.');
      return;
    }
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <Screen className="px-6 pt-12 pb-10">
      <Pressable
        testID="signin-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))}
        className="self-start mb-6 p-2 -ml-2 active:opacity-80"
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.gray}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M19 12H5M12 19l-7-7 7-7" />
        </Svg>
      </Pressable>

      <View className="items-center mb-8">
        <Text className="text-4xl leading-[46px] mb-3">🔐</Text>
        <Text className="font-nunito-extrabold text-2xl text-center text-echo-charcoal dark:text-white">Welcome back</Text>
        <Text className="font-inter text-sm text-center text-echo-gray mt-1">For LittleEchoes subscribers</Text>
      </View>

      <View className="gap-4">
        <View>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-1.5">Email</Text>
          <TextInput
            testID="signin-email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.gray}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            className={`${INPUT_CLASS} ${focused === 'email' ? 'border-echo-coral' : 'border-transparent'}`}
          />
        </View>
        <View>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-1.5">Password</Text>
          <TextInput
            ref={passwordRef}
            testID="signin-password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.gray}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleSignin()}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            className={`${INPUT_CLASS} ${focused === 'password' ? 'border-echo-coral' : 'border-transparent'}`}
          />
        </View>

        {!!error && (
          <Text testID="signin-error" className="font-inter text-xs text-red-500 text-center">
            {error}
          </Text>
        )}
        {resetSent && (
          <Text testID="signin-reset-sent" className="font-inter text-xs text-echo-sky text-center">
            Check your email for a reset link.
          </Text>
        )}

        <Pressable
          testID="signin-submit"
          accessibilityRole="button"
          onPress={() => void handleSignin()}
          disabled={loading}
          className={`w-full py-4 rounded-full bg-echo-coral items-center mt-2 active:opacity-80 ${loading ? 'opacity-60' : ''}`}
          style={shadows.coral}
        >
          <Text className="font-nunito-extrabold text-base text-white">{loading ? 'Signing in...' : 'Sign In'}</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-3 my-5">
        <View className="flex-1 h-px bg-echo-light-gray" />
        <Text className="font-inter text-xs text-echo-gray">or</Text>
        <View className="flex-1 h-px bg-echo-light-gray" />
      </View>
      <View className="gap-3">
        <AppleButton
          testID="signin-apple"
          onPress={() => void handleApple()}
          disabled={loading}
          darkMode={state.darkMode}
        />
        {isGoogleConfigured && (
          <GoogleButton testID="signin-google" onPress={() => void handleGoogle()} disabled={loading} />
        )}
      </View>

      <Pressable
        testID="signin-forgot-password"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => void handleForgotPassword()}
        className="mt-4 self-center active:opacity-80"
      >
        <Text className="font-inter text-xs text-echo-sky">Forgot password?</Text>
      </Pressable>

      <View className="flex-row items-center justify-center mt-6">
        <Text className="font-inter text-xs text-echo-gray">Not a subscriber yet? </Text>
        <Pressable
          testID="signin-get-started"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/onboarding')}
          className="active:opacity-80"
        >
          <Text className="font-inter-semibold text-xs text-echo-coral">Get started</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
