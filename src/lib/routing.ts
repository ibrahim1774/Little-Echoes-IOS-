import type { AppState } from '@/types';

export type Destination = '/onboarding' | '/setup/parent' | '/setup/child' | '/paywall' | '/home';

/** Where a user in this state belongs. One rule for the whole app. */
export function destinationFor(state: Pick<AppState, 'user' | 'parent' | 'children' | 'isPaid'>): Destination {
  if (!state.user) return '/onboarding';
  if (!state.parent) return '/setup/parent';
  if (state.children.length === 0) return '/setup/child';
  if (!state.isPaid) return '/paywall';
  return '/home';
}
