import { router } from 'expo-router';

import { signOut } from '@/services/auth';
import { getChildren, getParent } from '@/services/storage';
import type { AuthUser } from '@/types';

export const PROFILE_UNREACHABLE = "We couldn't load your family. Check your connection and try again.";

/**
 * No profile → setup; otherwise the index route picks paywall or home.
 * If the cloud profile couldn't be read, setup would create a new family over the real
 * one, so the user is signed back out and the returned message explains why.
 */
export async function routeAfterSignIn(user: AuthUser, { profileLoaded }: { profileLoaded: boolean }): Promise<string | null> {
  const parent = await getParent();
  if (!parent && !profileLoaded) {
    await signOut(user, { force: true });
    return PROFILE_UNREACHABLE;
  }
  const kids = parent ? await getChildren(parent.id) : [];
  if (!parent) router.replace('/setup/parent');
  else if (kids.length === 0) router.replace('/setup/child');
  else router.replace('/');
  return null;
}
