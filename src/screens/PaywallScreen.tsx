import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { useSubscriptionReady } from '@/context/SubscriptionReady';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { shadows } from '@/lib/theme';
import { deleteAccount, signOut } from '@/services/auth';
import { PLACEMENTS, usePaywall, useRestorePurchases } from '@/services/subscription';

const BENEFITS = [
  { icon: '🎯', text: '3 daily questions tailored to their age', color: '#FF6B6B' },
  { icon: '🎙️', text: 'Preserve their voice before it changes', color: '#6BC5F8' },
  { icon: '🌱', text: 'Voice Growth Timeline — hear them evolve', color: '#A8E06C' },
  { icon: '📹', text: 'Daily video clips to capture the moment', color: '#C4A1FF' },
  { icon: '🔒', text: '100% private — your data stays yours', color: '#FFD93D' },
];

/**
 * The hard gate. Superwall draws the plan picker; this screen sits behind it
 * so the user is never left on a blank page if the paywall is closed or fails.
 * Restore, Terms, Privacy, Sign Out and Delete account stay reachable here
 * without a subscription, as App Review requires.
 */
export function PaywallScreen() {
  const { state } = useApp();
  const subscriptionReady = useSubscriptionReady();
  const { present, presenting, error } = usePaywall();
  const restore = useRestorePurchases();
  const [busy, setBusy] = useState<'restore' | 'signout' | 'delete' | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const autoPresented = useRef(false);

  const childName = state.activeChild?.name || state.children[0]?.name || '';

  // Subscribed (purchase, restore, or already active) → into the app.
  useEffect(() => {
    if (state.isPaid) router.replace('/');
  }, [state.isPaid]);

  useEffect(() => {
    if (!state.user) router.replace('/');
  }, [state.user]);

  // Show the plans straight away, once.
  useEffect(() => {
    if (autoPresented.current || !subscriptionReady || state.isPaid || !state.user) return;
    autoPresented.current = true;
    void present(PLACEMENTS.onboarding);
  }, [subscriptionReady, state.isPaid, state.user, present]);

  async function handleRestore() {
    setBusy('restore');
    const result = await restore();
    setBusy(null);
    if (!result.ok) Alert.alert('Restore Purchases', result.message);
  }

  async function handleSignOut() {
    setBusy('signout');
    await signOut(state.user);
    setBusy(null);
    router.replace('/');
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, all profiles, recordings and videos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void handleDeleteAccount() },
      ]
    );
  }

  async function handleDeleteAccount() {
    setBusy('delete');
    setDeleteError('');
    try {
      const result = await deleteAccount();
      if (result.error) {
        setDeleteError(result.error);
        setBusy(null);
        return;
      }
      router.replace('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the account. Please try again.');
      setBusy(null);
    }
  }

  return (
    <Screen className="px-6 pt-10 pb-8">
      <View className="items-center gap-2">
        <Text className="text-4xl">🎙️</Text>
        <Text className="font-nunito-extrabold text-[24px] leading-tight text-echo-charcoal dark:text-white text-center">
          One last step before{childName ? ` ${childName}'s` : ' your'} memories begin
        </Text>
        <Text className="font-inter text-sm text-echo-gray leading-relaxed text-center">
          Choose a plan to start preserving their voice forever.
        </Text>
      </View>

      <View className="bg-white dark:bg-echo-dark-card rounded-2xl p-4 mt-5" style={shadows.soft}>
        <Text className="font-nunito-bold text-xs text-echo-gray uppercase tracking-wide mb-3">What you get</Text>
        <View className="gap-2.5">
          {BENEFITS.map((b) => (
            <View key={b.text} className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: b.color + '20' }}>
                <Text className="text-base">{b.icon}</Text>
              </View>
              <Text className="flex-1 font-nunito-semibold text-xs text-echo-charcoal dark:text-white leading-snug">
                {b.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {error && (
        <Text testID="paywall-error" className="font-inter text-xs text-red-500 text-center mt-4">
          {error}
        </Text>
      )}

      <View className="mt-auto pt-6 gap-3">
        <Pressable
          testID="paywall-see-plans"
          accessibilityRole="button"
          disabled={presenting || !subscriptionReady}
          onPress={() => void present(PLACEMENTS.onboarding)}
          className={`w-full py-4 rounded-full bg-echo-coral items-center active:opacity-80 ${
            presenting || !subscriptionReady ? 'opacity-60' : ''
          }`}
          style={shadows.coral}
        >
          {presenting || !subscriptionReady ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-nunito-extrabold text-base text-white">See Plans</Text>
          )}
        </Pressable>

        <Text className="font-inter text-xs text-echo-gray text-center">
          Pro plans start with a 3-day free trial. Cancel anytime.
        </Text>

        <View className="flex-row justify-center gap-5 mt-1">
          <Pressable testID="paywall-restore" accessibilityRole="button" disabled={busy !== null} onPress={() => void handleRestore()}>
            <Text className="font-inter-semibold text-xs text-echo-coral">
              {busy === 'restore' ? 'Restoring…' : 'Restore Purchases'}
            </Text>
          </Pressable>
          <Pressable testID="paywall-signout" accessibilityRole="button" disabled={busy !== null} onPress={() => void handleSignOut()}>
            <Text className="font-inter-semibold text-xs text-echo-gray">
              {busy === 'signout' ? 'Signing out…' : 'Sign Out'}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row justify-center gap-5">
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)}>
            <Text className="font-inter text-[11px] text-echo-gray underline">Terms of Use</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)}>
            <Text className="font-inter text-[11px] text-echo-gray underline">Privacy Policy</Text>
          </Pressable>
          <Pressable testID="paywall-delete-account" accessibilityRole="button" disabled={busy !== null} onPress={confirmDeleteAccount}>
            <Text className="font-inter text-[11px] text-echo-gray underline">
              {busy === 'delete' ? 'Deleting…' : 'Delete Account'}
            </Text>
          </Pressable>
        </View>
        {deleteError !== '' && (
          <Text testID="paywall-delete-error" className="font-inter text-xs text-red-500 text-center">
            {deleteError}
          </Text>
        )}
      </View>
    </Screen>
  );
}
