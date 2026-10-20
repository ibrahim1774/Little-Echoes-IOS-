import { reducer } from '@/context/AppContext';
import { resolveTier } from '@/lib/logic';
import { destinationFor, gateFor } from '@/lib/routing';
import type { AppState, ChildProfile, ParentProfile } from '@/types';

// AppContext's reducer is pure; stub the services its module imports.
jest.mock('nativewind', () => ({ colorScheme: { set: jest.fn() } }));
jest.mock('@/services/cloudSync', () => ({}));
jest.mock('@/services/db', () => ({}));
jest.mock('@/services/notifications', () => ({}));
jest.mock('@/services/storage', () => ({}));
jest.mock('@/services/supabase', () => ({}));
jest.mock('@/services/analytics', () => ({}));

const user = { id: 'u', email: 'a@b.com' };
const parent = { id: 'p' } as ParentProfile;
const child = { id: 'c' } as ChildProfile;

describe('destinationFor', () => {
  it('sends signed-out users to onboarding, which ends at the paywall', () => {
    expect(destinationFor({ user: null, parent: null, children: [], isPaid: false })).toBe('/onboarding');
    expect(destinationFor({ user: null, parent, children: [child], isPaid: false })).toBe('/onboarding');
  });
  it('sends a signed-out subscriber (paid, then quit before signing up, or reinstalled) to sign-up', () => {
    expect(destinationFor({ user: null, parent: null, children: [], isPaid: true })).toBe('/signup');
  });
  it('walks setup in order', () => {
    expect(destinationFor({ user, parent: null, children: [], isPaid: false })).toBe('/setup/parent');
    expect(destinationFor({ user, parent, children: [], isPaid: false })).toBe('/setup/child');
  });
  it('finishes setup before the paywall even for subscribers', () => {
    expect(destinationFor({ user, parent: null, children: [], isPaid: true })).toBe('/setup/parent');
  });
  it('gates the app behind the paywall', () => {
    expect(destinationFor({ user, parent, children: [child], isPaid: false })).toBe('/paywall');
    expect(destinationFor({ user, parent, children: [child], isPaid: true })).toBe('/home');
  });
});

describe('gateFor', () => {
  const setUp = { user, parent, children: [child] };

  it('waits while local data and the session load, whatever else is known', () => {
    expect(gateFor({ ...setUp, isPaid: false, isLoading: true }, true)).toBe('loading');
    expect(gateFor({ ...setUp, isPaid: true, isLoading: true }, true)).toBe('loading');
    expect(gateFor({ user: null, parent: null, children: [], isPaid: false, isLoading: true }, false)).toBe('loading');
  });

  it("doesn't wait for a subscription status before onboarding or setup", () => {
    expect(gateFor({ user: null, parent: null, children: [], isPaid: false, isLoading: false }, false)).toBe('/onboarding');
    expect(gateFor({ user, parent: null, children: [], isPaid: false, isLoading: false }, false)).toBe('/setup/parent');
    expect(gateFor({ user, parent, children: [], isPaid: false, isLoading: false }, false)).toBe('/setup/child');
  });

  it('shows neither the paywall nor the app until the subscription status is known', () => {
    expect(gateFor({ ...setUp, isPaid: false, isLoading: false }, false)).toBe('loading');
  });

  it('lets a subscriber straight in as soon as an active status arrives', () => {
    expect(gateFor({ ...setUp, isPaid: true, isLoading: false }, false)).toBe('/home');
    expect(gateFor({ ...setUp, isPaid: true, isLoading: false }, true)).toBe('/home');
  });

  it('locks non-subscribers out once the status is known (never subscribed, timed out, or expired)', () => {
    expect(gateFor({ ...setUp, isPaid: false, isLoading: false }, true)).toBe('/paywall');
  });

  it('never lets a signed-out user into the app; a subscriber is sent to make or sign in to an account', () => {
    expect(gateFor({ user: null, parent, children: [child], isPaid: true, isLoading: false }, true)).toBe('/signup');
  });

  it("starts onboarding at once for a new user, without waiting on the subscription status", () => {
    expect(gateFor({ user: null, parent: null, children: [], isPaid: false, isLoading: false }, false)).toBe('/onboarding');
  });
});

describe('subscription state', () => {
  const signedInSubscriber: AppState = {
    parent,
    children: [child],
    activeChild: child,
    isOnboarded: true,
    darkMode: false,
    todayQuestions: [],
    todaySession: null,
    todayProgress: null,
    todayVideoRecorded: false,
    isPaid: true,
    tier: 'pro',
    streak: null,
    isLoading: false,
    user,
  };

  it('keeps the device subscription across sign-out but still requires an account', () => {
    const signedOut = reducer(signedInSubscriber, { type: 'RESET' });
    expect(signedOut.isPaid).toBe(true);
    expect(gateFor(signedOut, true)).toBe('/signup');
  });

  it('locks again when the subscription expires', () => {
    const expired = reducer(signedInSubscriber, { type: 'SET_SUBSCRIPTION', payload: { isPaid: false, tier: null } });
    expect(gateFor(expired, true)).toBe('/paywall');
  });

  it('lets a restored subscription back in', () => {
    const locked = { ...signedInSubscriber, isPaid: false, tier: null };
    const restored = reducer(locked, { type: 'SET_SUBSCRIPTION', payload: { isPaid: true, tier: 'basic' } });
    expect(gateFor(restored, true)).toBe('/home');
  });

  it('only real entitlements unlock the app', () => {
    expect(resolveTier([], 'someone@example.com').isPaid).toBe(false);
    expect(resolveTier(['basic'], null)).toEqual({ isPaid: true, tier: 'basic' });
    expect(resolveTier(['pro'], null)).toEqual({ isPaid: true, tier: 'pro' });
  });
});
