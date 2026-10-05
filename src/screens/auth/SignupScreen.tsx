import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppleButton } from '@/components/auth/AppleButton';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { isGoogleConfigured, signInWithApple, signInWithGoogle, signUpWithEmail, type AuthResult } from '@/services/auth';
import { syncToCloud } from '@/services/cloudSync';
import { getChildren, getParent } from '@/services/storage';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT_CLASS =
  'w-full bg-white dark:bg-echo-dark-card rounded-2xl px-4 py-3.5 font-inter text-[14px] text-echo-charcoal dark:text-white border-2';

export function SignupScreen() {
  const { state, hydrateUser } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

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

    const { user, isNewUser } = result;
    try {
      await hydrateUser(user);
    } catch {
      // Cloud load failed; carry on with whatever is on the device.
    }
    track(isNewUser ? 'sign_up' : 'sign_in');
    void syncToCloud(user);

    // New accounts start at parent setup; a Google account that already has data skips ahead.
    const parent = await getParent();
    const kids = parent ? await getChildren(parent.id) : [];
    const destination = !parent ? '/setup/parent' : kids.length === 0 ? '/setup/child' : '/';

    setSuccess(true);
    redirectTimer.current = setTimeout(() => router.replace(destination), 1200);
  }

  async function handleSignup() {
    if (loading) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    await completeAuth(await signUpWithEmail(email, password));
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
    await completeAuth(await signInWithGoogle());
  }

  if (success) {
    return (
      <Screen scroll={false} className="items-center justify-center px-8">
        <Text className="text-5xl leading-[60px] mb-4">✅</Text>
        <Text testID="signup-success" className="font-nunito-extrabold text-xl text-center text-echo-charcoal dark:text-white">
          Account created!
        </Text>
        <Text className="font-inter text-sm text-center text-echo-gray mt-2">Let's set up your profile...</Text>
      </Screen>
    );
  }

  return (
    <Screen className="px-6 pt-12 pb-10">
      <View className="items-center mb-8">
        <Text className="text-4xl leading-[46px] mb-3">👋</Text>
        <Text className="font-nunito-extrabold text-2xl text-center text-echo-charcoal dark:text-white">
          Create your account
        </Text>
        <Text className="font-inter text-sm text-center text-echo-gray mt-1">
          Your echoes will be saved securely to the cloud.
        </Text>
      </View>

      <View className="gap-4">
        <View>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-1.5">Email</Text>
          <TextInput
            testID="signup-email"
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
            testID="signup-password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.gray}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleSignup()}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            className={`${INPUT_CLASS} ${focused === 'password' ? 'border-echo-coral' : 'border-transparent'}`}
          />
        </View>
        {!!error && (
          <Text testID="signup-error" className="font-inter text-xs text-red-500 text-center">
            {error}
          </Text>
        )}

        <Pressable
          testID="signup-submit"
          accessibilityRole="button"
          onPress={() => void handleSignup()}
          disabled={loading}
          className={`w-full py-4 rounded-full bg-echo-coral items-center mt-2 active:opacity-80 ${loading ? 'opacity-60' : ''}`}
          style={shadows.coral}
        >
          <Text className="font-nunito-extrabold text-base text-white">
            {loading ? 'Creating account...' : 'Create Account'}
          </Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-3 my-5">
        <View className="flex-1 h-px bg-echo-light-gray" />
        <Text className="font-inter text-xs text-echo-gray">or</Text>
        <View className="flex-1 h-px bg-echo-light-gray" />
      </View>
      <View className="gap-3">
        <AppleButton
          testID="signup-apple"
          onPress={() => void handleApple()}
          disabled={loading}
          darkMode={state.darkMode}
        />
        {isGoogleConfigured && (
          <GoogleButton testID="signup-google" onPress={() => void handleGoogle()} disabled={loading} />
        )}
      </View>

      <View className="flex-row items-center justify-center mt-6">
        <Text className="font-inter text-xs text-echo-gray">Already have an account? </Text>
        <Pressable
          testID="signup-signin-link"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/signin')}
          className="active:opacity-80"
        >
          <Text className="font-inter-semibold text-xs text-echo-coral">Sign in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
