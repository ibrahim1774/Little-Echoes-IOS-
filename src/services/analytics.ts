/**
 * One place to send product events. Fans out to PostHog and AppsFlyer.
 * Every call is best-effort: analytics must never break the app.
 */
import appsFlyer from 'react-native-appsflyer';
import PostHog from 'posthog-react-native';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const AF_DEV_KEY = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY;
const AF_APP_ID = process.env.EXPO_PUBLIC_APPSFLYER_APP_ID; // numeric App Store ID

let posthog: PostHog | null = null;
let appsFlyerReady = false;
let initialised = false;
let pendingUserId: string | null = null;

// AppsFlyer's standard event names, so ad networks recognise them.
const APPSFLYER_EVENTS: Record<string, string> = {
  sign_up: 'af_complete_registration',
  sign_in: 'af_login',
  trial_started: 'af_start_trial',
  subscription_started: 'af_subscribe',
  onboarding_completed: 'af_tutorial_completion',
};

export function initAnalytics(): void {
  if (initialised) return;
  initialised = true;

  if (POSTHOG_KEY) {
    try {
      posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
    } catch (err) {
      console.warn('[analytics] PostHog init failed', err);
    }
  }

  if (AF_DEV_KEY && AF_APP_ID) {
    try {
      void appsFlyer.init({ devKey: AF_DEV_KEY, appId: AF_APP_ID }).catch((err: unknown) =>
        console.warn('[analytics] AppsFlyer init failed', err)
      );
      if (__DEV__) void appsFlyer.enableDebug({ enabled: true });
      // Native never auto-starts; start once the session is ready.
      appsFlyer.registerSessionReadyListener(() => {
        appsFlyer.start().then(
          () => {
            appsFlyerReady = true;
            if (pendingUserId) void appsFlyer.setCustomerUserId({ customerId: pendingUserId });
          },
          (err: unknown) => console.warn('[analytics] AppsFlyer start failed', err)
        );
      });
    } catch (err) {
      console.warn('[analytics] AppsFlyer setup failed', err);
    }
  }
}

export function identifyUser(userId: string): void {
  try {
    posthog?.identify(userId);
    pendingUserId = userId;
    if (appsFlyerReady) void appsFlyer.setCustomerUserId({ customerId: userId });
  } catch (err) {
    console.warn('[analytics] identify failed', err);
  }
}

export function resetAnalytics(): void {
  try {
    posthog?.reset();
  } catch {
    // ignore
  }
}

export function track(event: string, props: Record<string, string | number | boolean | null> = {}): void {
  try {
    posthog?.capture(event, props);
    const afName = APPSFLYER_EVENTS[event];
    if (appsFlyerReady && afName) void appsFlyer.logEvent({ eventName: afName, eventValues: props }).catch(() => {});
  } catch (err) {
    console.warn('[analytics] track failed', err);
  }
}
