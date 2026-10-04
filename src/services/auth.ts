import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { supabase } from './supabase';
import { deleteAllMedia } from './files';
import { cancelReminders } from './notifications';
import { clearAllData, getAllRecordings, getAllVideos } from './storage';
import { syncToCloud } from './cloudSync';
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

/** How many recordings and videos exist only on this device. */
export async function countUnsynced(): Promise<number> {
  const [recordings, videos] = await Promise.all([getAllRecordings(), getAllVideos()]);
  return recordings.filter((r) => !r.audioUrl).length + videos.filter((v) => !v.videoUrl).length;
}

/** Remove this family's data from the device. */
export async function clearLocalData(): Promise<void> {
  await cancelReminders().catch(() => {});
  await clearAllData();
  deleteAllMedia();
}

/**
 * Sign out. Uploads anything pending first, then clears the device so the
 * next account never sees this one's data.
 */
export async function signOut(user: AuthUser | null): Promise<void> {
  if (user) await syncToCloud(user);
  await clearLocalData();
  resetAnalytics();
  if (isGoogleConfigured) await GoogleSignin.signOut().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
}

/** Permanently delete the account and everything stored for it. */
export async function deleteAccount(): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) return { error: error.message };
  if (data && typeof data === 'object' && 'error' in data && data.error) return { error: String(data.error) };
  await clearLocalData();
  resetAnalytics();
  if (isGoogleConfigured) await GoogleSignin.signOut().catch(() => {});
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return {};
}
