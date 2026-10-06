/**
 * Trial and purchase events must reach AppsFlyer even when they fire before the SDK has
 * finished starting (ATT prompt open, slow network on the first paywall).
 */
const mockAppsFlyer = {
  init: jest.fn(() => Promise.resolve()),
  enableDebug: jest.fn(() => Promise.resolve()),
  start: jest.fn(() => Promise.resolve()),
  logEvent: jest.fn(() => Promise.resolve()),
  setCustomerUserId: jest.fn(() => Promise.resolve()),
  registerSessionReadyListener: jest.fn(),
};

// The ATT prompt waits for the app to be in the foreground; analytics only uses AppState.
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('react-native-appsflyer', () => ({ __esModule: true, default: mockAppsFlyer }));
jest.mock('posthog-react-native', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-tracking-transparency', () => ({
  requestTrackingPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));

type Analytics = typeof import('@/services/analytics');

function loadAnalytics(): Analytics {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = '';
  process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY = 'dev-key';
  process.env.EXPO_PUBLIC_APPSFLYER_APP_ID = '123';
  let mod!: Analytics;
  jest.isolateModules(() => {
    // A fresh module per test resets its module-level AppsFlyer state.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/services/analytics');
  });
  return mod;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function sessionReady(): Promise<() => void> {
  // startAppsFlyer awaits the ATT prompt before registering the session listener.
  for (let i = 0; i < 5 && mockAppsFlyer.registerSessionReadyListener.mock.calls.length === 0; i++) await flush();
  const calls = mockAppsFlyer.registerSessionReadyListener.mock.calls as unknown as [() => void][];
  expect(calls.length).toBe(1);
  return calls[0][0];
}

beforeEach(() => jest.clearAllMocks());

it('queues trial and subscribe events until AppsFlyer has started, then sends them in order', async () => {
  const analytics = loadAnalytics();
  analytics.initAnalytics();
  const onSessionReady = await sessionReady();

  analytics.identifyUser('user-1');
  analytics.track('trial_started', { af_revenue: 0, af_currency: 'USD', af_content_id: 'pro_yearly' });
  analytics.track('subscription_started', { af_revenue: 4.99, af_currency: 'USD', af_content_id: 'basic_monthly' });
  analytics.track('video_saved'); // not an AppsFlyer event
  expect(mockAppsFlyer.logEvent).not.toHaveBeenCalled();

  onSessionReady();
  await flush();

  expect(mockAppsFlyer.setCustomerUserId).toHaveBeenCalledWith({ customerId: 'user-1' });
  expect(mockAppsFlyer.logEvent.mock.calls).toEqual([
    [{ eventName: 'af_start_trial', eventValues: { af_revenue: 0, af_currency: 'USD', af_content_id: 'pro_yearly' } }],
    [{ eventName: 'af_subscribe', eventValues: { af_revenue: 4.99, af_currency: 'USD', af_content_id: 'basic_monthly' } }],
  ]);
});

it('sends events straight away once AppsFlyer is running', async () => {
  const analytics = loadAnalytics();
  analytics.initAnalytics();
  (await sessionReady())();
  await flush();

  analytics.track('subscription_started', { af_revenue: 9.99, af_currency: 'USD', af_content_id: 'pro_monthly' });
  expect(mockAppsFlyer.logEvent).toHaveBeenCalledTimes(1);
  expect(mockAppsFlyer.logEvent).toHaveBeenCalledWith({
    eventName: 'af_subscribe',
    eventValues: { af_revenue: 9.99, af_currency: 'USD', af_content_id: 'pro_monthly' },
  });
});
