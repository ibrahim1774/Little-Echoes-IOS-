/**
 * One place to send product events. Fans out to PostHog and AppsFlyer.
 * Every call is best-effort: analytics must never break the app.
 */
import { AppState } from 'react-native';
import appsFlyer from 'react-native-appsflyer';
import PostHog from 'posthog-react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const AF_DEV_KEY = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY;
const AF_APP_ID = process.env.EXPO_PUBLIC_APPSFLYER_APP_ID; // numeric App Store ID

let posthog: PostHog | null = null;
let appsFlyerReady = false;
let initialised = false;
let pendingUserId: string | null = null;

type AfEvent = { eventName: string; eventValues: Record<string, string | number | boolean | null> };
// Events logged before AppsFlyer has started (ATT prompt still open, slow or offline start)
// wait here instead of being dropped, so a trial or purchase is never lost. Bounded so a
// session where AppsFlyer never starts can't grow it without limit.
const MAX_PENDING_AF_EVENTS = 50;
const pendingAfEvents: AfEvent[] = [];

function logAppsFlyerEvent(event: AfEvent): void {
  void appsFlyer.logEvent(event).catch(() => {});
}

function flushAppsFlyerEvents(): void {
  for (const event of pendingAfEvents.splice(0)) logAppsFlyerEvent(event);
}

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
      // Lifecycle events give installs, opens and backgrounding without extra calls.
      posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, captureAppLifecycleEvents: true });
    } catch (err) {
      console.warn('[analytics] PostHog init failed', err);
    }
  }

  if (AF_DEV_KEY && AF_APP_ID) void startAppsFlyer(AF_DEV_KEY, AF_APP_ID);
}

/**
 * Ask for App Tracking Transparency before AppsFlyer starts (AppsFlyer v7 no longer
 * waits for it). Whatever the answer, attribution runs; the IDFA is only read if allowed.
 */
async function startAppsFlyer(devKey: string, appId: string): Promise<void> {
  try {
    // iOS silently skips the prompt unless the app is in the foreground.
    await whenActive();
    await requestTrackingPermissionsAsync();
  } catch (err) {
    console.warn('[analytics] tracking permission request failed', err);
  }
  try {
    void appsFlyer.init({ devKey, appId }).catch((err: unknown) =>
      console.warn('[analytics] AppsFlyer init failed', err)
    );
    if (__DEV__) void appsFlyer.enableDebug({ enabled: true });
    // Native never auto-starts; start once the session is ready.
    appsFlyer.registerSessionReadyListener(() => {
      appsFlyer.start().then(
        () => {
          appsFlyerReady = true;
          if (pendingUserId) void appsFlyer.setCustomerUserId({ customerId: pendingUserId });
          flushAppsFlyerEvents();
        },
        (err: unknown) => console.warn('[analytics] AppsFlyer start failed', err)
      );
    });
  } catch (err) {
    console.warn('[analytics] AppsFlyer setup failed', err);
  }
}

function whenActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
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

/** Record a screen view (route path) in PostHog. */
export function trackScreen(path: string): void {
  try {
    posthog?.screen(path);
  } catch (err) {
    console.warn('[analytics] screen failed', err);
  }
}

/** Store the user's plan on their PostHog person so funnels can be split by tier. */
export function setUserTier(tier: string | null): void {
  try {
    if (pendingUserId) posthog?.identify(pendingUserId, { tier: tier ?? 'none' });
  } catch (err) {
    console.warn('[analytics] set tier failed', err);
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
    if (!afName) return;
    const afEvent = { eventName: afName, eventValues: props };
    if (appsFlyerReady) logAppsFlyerEvent(afEvent);
    else if (AF_DEV_KEY && AF_APP_ID && pendingAfEvents.length < MAX_PENDING_AF_EVENTS) pendingAfEvents.push(afEvent);
  } catch (err) {
    console.warn('[analytics] track failed', err);
  }
}
