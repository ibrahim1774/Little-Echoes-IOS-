import { Alert } from 'react-native';

import { signOut } from '@/services/auth';
import type { AuthUser } from '@/types';

/**
 * Sign out, but ask first if anything hasn't reached the cloud — signing out clears this
 * device, so those memories would be lost. Resolves true once signed out.
 */
export async function signOutSafely(user: AuthUser | null): Promise<boolean> {
  const { unsynced } = await signOut(user);
  if (unsynced === 0) return true;
  return new Promise((resolve) => {
    Alert.alert(
      'Not backed up yet',
      `${unsynced === 1 ? '1 memory or change hasn’t' : `${unsynced} memories or changes haven’t`} reached the cloud. ` +
        'Connect to the internet and try again, or sign out anyway and lose them.',
      [
        { text: 'Stay signed in', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Sign out anyway',
          style: 'destructive',
          onPress: () => {
            void signOut(user, { force: true }).then(
              () => resolve(true),
              () => resolve(false)
            );
          },
        },
      ],
      { cancelable: false }
    );
  });
}
