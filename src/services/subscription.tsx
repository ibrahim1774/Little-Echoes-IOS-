/**
 * Bridges Superwall into app state: identifies the signed-in user, turns
 * active entitlements into { isPaid, tier }, and exposes paywall helpers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { usePlacement, useSuperwall, useSuperwallEvents, useUser } from 'expo-superwall';

import { useApp } from '@/context/AppContext';
import { resolveTier } from '@/lib/logic';
import { track } from './analytics';
import { writeSubscriptionToProfile } from './cloudSync';

export const PLACEMENTS = {
  onboarding: 'onboarding_paywall',
  videoGate: 'video_gate',
  settingsUpgrade: 'settings_upgrade',
} as const;

export type Placement = (typeof PLACEMENTS)[keyof typeof PLACEMENTS];

// If Superwall can't report a status (offline first launch), stop waiting and
// treat the user as unsubscribed. An unknown status must never grant access.
const STATUS_TIMEOUT_MS = 8000;

/** Mount once under SuperwallProvider and AppProvider. Renders nothing. */
export function SubscriptionBridge({ onReady }: { onReady: () => void }) {
  const { state, dispatch } = useApp();
  const { subscriptionStatus, identify, signOut } = useUser();
  const userId = state.user?.id ?? null;
  const email = state.user?.email ?? null;
  const identified = useRef<string | null>(null);
  const lastWritten = useRef<string | null>(null);
  const readyRef = useRef(false);

  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady();
  }, [onReady]);

  // identify() can fail while Superwall is still configuring (slow network),
  // so retry rather than leaving the user anonymous for the whole session.
  const [identifyAttempt, setIdentifyAttempt] = useState(0);
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    if (userId && identified.current !== userId) {
      identified.current = userId;
      identify(userId).catch((err) => {
        console.warn('[superwall] identify failed', err);
        if (identified.current === userId) identified.current = null;
        if (identifyAttempt < 5) retry = setTimeout(() => setIdentifyAttempt((n) => n + 1), 5000);
      });
    } else if (!userId && identified.current) {
      identified.current = null;
      void signOut().catch(() => {});
    }
    return () => {
      if (retry) clearTimeout(retry);
    };
  }, [userId, identify, signOut, identifyAttempt]);

  useEffect(() => {
    const timer = setTimeout(markReady, STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [markReady]);

  useEffect(() => {
    const status = subscriptionStatus?.status ?? 'UNKNOWN';
    const active = status === 'ACTIVE' ? (subscriptionStatus as { entitlements: { id: string }[] }).entitlements : [];
    const resolved = resolveTier(active.map((e) => e.id), email);
    dispatch({ type: 'SET_SUBSCRIPTION', payload: resolved });
    if (status !== 'UNKNOWN') markReady();

    // Mirror a real store subscription onto the profile for the web app.
    if (userId && status === 'ACTIVE' && resolved.isPaid) {
      const key = `${userId}:${resolved.tier}`;
      if (lastWritten.current !== key) {
        lastWritten.current = key;
        void writeSubscriptionToProfile({ id: userId, email: email ?? '' }, true, resolved.tier);
      }
    }
  }, [subscriptionStatus, email, userId, dispatch, markReady]);

  useSuperwallEvents({
    onSuperwallEvent: ({ event }) => {
      // AppsFlyer reads af_revenue / af_currency / af_content_id for revenue reporting.
      if (event.event === 'freeTrialStart') {
        track('trial_started', {
          af_revenue: 0,
          af_currency: event.product.currencyCode ?? 'USD',
          af_content_id: event.product.productIdentifier,
        });
      } else if (event.event === 'subscriptionStart') {
        track('subscription_started', {
          af_revenue: event.product.price,
          af_currency: event.product.currencyCode ?? 'USD',
          af_content_id: event.product.productIdentifier,
        });
      }
      else if (event.event === 'paywallOpen') track('paywall_viewed');
      else if (event.event === 'transactionFail') track('purchase_failed');
    },
  });

  return null;
}

const LOAD_PLANS_ERROR = 'Could not load plans. Please check your connection and try again.';

/** Present a paywall for a placement. `onEntitled` runs once the user has access. */
export function usePaywall() {
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const { registerPlacement } = usePlacement({
    onPresent: () => setPresenting(true),
    onDismiss: () => setPresenting(false),
    onSkip: (reason) => {
      setPresenting(false);
      // Already-subscribed users are routed into the app by the bridge; any
      // other skip means no paywall is set up for this placement.
      setError(
        reason.type === 'PlacementNotFound' || reason.type === 'NoAudienceMatch' || reason.type === 'Holdout'
          ? "Plans aren't available right now. Please try again in a moment."
          : null
      );
    },
    onError: (message) => {
      setPresenting(false);
      // SDK messages are technical ("configure did not complete within 10000ms"); show plain text.
      if (__DEV__) console.warn('[usePaywall] error', message);
      setError(LOAD_PLANS_ERROR);
    },
  });

  const present = useCallback(
    async (placement: Placement, onEntitled?: () => void) => {
      setError(null);
      try {
        await registerPlacement({ placement, feature: onEntitled });
      } catch (err) {
        if (__DEV__) console.warn('[usePaywall] register failed', err);
        setError(LOAD_PLANS_ERROR);
      }
    },
    [registerPlacement]
  );

  return { present, presenting, error };
}

export function useRestorePurchases() {
  const restorePurchases = useSuperwall((s) => s.restorePurchases);
  return useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const result = await restorePurchases();
      if (result.result === 'restored') return { ok: true, message: 'Your purchases were restored.' };
      return { ok: false, message: result.errorMessage || 'No purchases were found to restore.' };
    } catch (err) {
      if (__DEV__) console.warn('[useRestorePurchases] failed', err);
      return { ok: false, message: 'Restore failed. Please check your connection and try again.' };
    }
  }, [restorePurchases]);
}

export function openManageSubscriptions(): void {
  void Linking.openURL('https://apps.apple.com/account/subscriptions');
}
