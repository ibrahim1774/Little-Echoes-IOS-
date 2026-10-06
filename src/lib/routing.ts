import type { AppState } from '@/types';

export type Destination = '/onboarding' | '/setup/parent' | '/setup/child' | '/paywall' | '/home';

type RoutingState = Pick<AppState, 'user' | 'parent' | 'children' | 'isPaid'>;

/** Where a user in this state belongs. One rule for the whole app. */
export function destinationFor(state: RoutingState): Destination {
  if (!state.user) return '/onboarding';
  if (!state.parent) return '/setup/parent';
  if (state.children.length === 0) return '/setup/child';
  if (!state.isPaid) return '/paywall';
  return '/home';
}

/**
 * The launch gate used by every entry point (the index route and the tabs layout, which
 * also catches deep links). Returns 'loading' while the answer isn't known yet:
 * - local data and the session are still loading, or
 * - the user would be sent to the paywall but Superwall hasn't reported a status yet.
 * Waiting in that second case means subscribers never see the paywall flash and
 * non-subscribers never see the app: only a splash shows until the status is known.
 */
export function gateFor(
  state: RoutingState & Pick<AppState, 'isLoading'>,
  subscriptionReady: boolean
): Destination | 'loading' {
  if (state.isLoading) return 'loading';
  const destination = destinationFor(state);
  if (destination === '/paywall' && !subscriptionReady) return 'loading';
  return destination;
}
