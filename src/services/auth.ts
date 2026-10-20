import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { supabase } from './supabase';
import { deleteAllMedia, fileExists } from './files';
import { cancelReminders } from './notifications';
import { clearAllData, getAllRecordings, getAllVideos } from './storage';
import { getPendingDeletes, syncToCloud } from './cloudSync';
import { resetAnalytics } from './analytics';
import type { AuthUser } from '@/types';

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export const isGoogleConfigured = !!GOOGLE_IOS_CLIENT_ID;

if (isGoogleConfigured) {
  GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID });
}

export type AuthResult =
  | { user: AuthUser; isNewUser: boolean }
  | { error: string }
  | { cancelled: true };

function toUser(u: { id: string; email?: string | null }): AuthUser {
  return { id: u.id, email: u.email ?? '' };
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'Could not create the account. Please try again.' };
  // With email confirmation on, Supabase returns a user but no session.
  if (!data.session) {
    return { error: 'Check your email to confirm your account, then sign in.' };
  }
  return { user: toUser(data.user), isNewUser: true };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'Could not sign in. Please try again.' };
  return { user: toUser(data.user), isNewUser: false };
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isGoogleConfigured) return { error: 'Google sign-in is not set up yet.' };
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { cancelled: true };
    const idToken = response.data.idToken;
    if (!idToken) return { error: 'Google did not return a sign-in token.' };

    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Could not sign in with Google. Please try again.' };

    const created = new Date(data.user.created_at).getTime();
    return { user: toUser(data.user), isNewUser: Date.now() - created < 60_000 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Google sign-in failed.' };
  }
}

/** Where the reset email's link sends people. Must be listed in Supabase Auth → Redirect URLs. */
export const RESET_PASSWORD_REDIRECT = 'littleechoes://reset-password';

export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_PASSWORD_REDIRECT });
  return error ? { error: error.message } : {};
}

/** Redeem the code from a reset link. Signs this device in as the account being reset. */
export async function beginPasswordReset(code: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return { error: error?.message ?? 'This reset link is no longer valid.' };
  return { user: toUser(data.user), isNewUser: false };
}

export async function setNewPassword(password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : {};
}

/** Sign in with Apple is available on every supported iOS version, but check anyway. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native Sign in with Apple → Supabase. Apple receives the SHA-256 of a random nonce;
 * Supabase receives the raw nonce and checks it against the identity token.
 */
export async function signInWithApple(): Promise<AuthResult> {
  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { error: 'Apple did not return a sign-in token.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Could not sign in with Apple. Please try again.' };

    // Apple only shares the name on the very first sign-in; keep it on the account.
    const givenName = credential.fullName?.givenName;
    if (givenName) {
      await supabase.auth
        .updateUser({ data: { full_name: [givenName, credential.fullName?.familyName].filter(Boolean).join(' '), given_name: givenName } })
        .catch(() => {});
    }

    const created = new Date(data.user.created_at).getTime();
    return { user: toUser(data.user), isNewUser: Date.now() - created < 60_000 };
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    return { error: err instanceof Error ? err.message : 'Apple sign-in failed.' };
  }
}

/** How many recordings, videos and deletes haven't reached the cloud yet. */
export async function countUnsynced(): Promise<number> {
  const [recordings, videos, pendingDeletes] = await Promise.all([getAllRecordings(), getAllVideos(), getPendingDeletes()]);
  // An item with no file and no cloud copy can never sync, so it doesn't hold up sign-out.
  const waiting = (item: { rowSynced?: boolean; localUri?: string }, remote?: string) =>
    !item.rowSynced && (!!remote || fileExists(item.localUri));
  return (
    recordings.filter((r) => waiting(r, r.audioUrl)).length +
    videos.filter((v) => waiting(v, v.videoUrl)).length +
    pendingDeletes.length
  );
}

/** Remove this family's data from the device. */
export async function clearLocalData(): Promise<void> {
  await cancelReminders().catch(() => {});
  await clearAllData();
  deleteAllMedia();
}

/**
 * Sign out. Uploads anything pending first, then clears the device so the
 * next account never sees this one's data. If something still hasn't reached
 * the cloud, nothing is cleared and the count comes back so the caller can ask
 * the parent first; `force` signs out anyway.
 */
export async function signOut(user: AuthUser | null, { force = false } = {}): Promise<{ unsynced: number }> {
  if (user) await syncToCloud(user);
  const unsynced = user ? await countUnsynced() : 0;
  if (unsynced > 0 && !force) return { unsynced };
  await clearLocalData();
  resetAnalytics();
  if (isGoogleConfigured) await GoogleSignin.signOut().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
  return { unsynced };
}

/** Permanently delete the account and everything stored for it. */
export async function deleteAccount(): Promise<{ error?: string }> {
  // Apple requires revoking Sign in with Apple tokens when an account is deleted.
  // A fresh authorization code lets the server do that.
  let appleAuthorizationCode: string | undefined;
  const { data: current } = await supabase.auth.getUser();
  const providers = (current.user?.app_metadata?.providers as string[] | undefined) ?? [];
  if (providers.includes('apple') && (await isAppleSignInAvailable())) {
    try {
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
      appleAuthorizationCode = credential.authorizationCode ?? undefined;
    } catch (err) {
      if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
        return { error: 'Confirm with Apple to delete your account.' };
      }
    }
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    body: appleAuthorizationCode ? { appleAuthorizationCode } : {},
  });
  if (error) return { error: error.message };
  if (data && typeof data === 'object' && 'error' in data && data.error) return { error: String(data.error) };
  await clearLocalData();
  resetAnalytics();
  if (isGoogleConfigured) await GoogleSignin.signOut().catch(() => {});
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return {};
}
