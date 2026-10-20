/**
 * What the parent told us during onboarding, before they have an account. Kept on the
 * device so the paywall and the setup screens after sign-up can use it.
 */
import { parseJson } from '@/lib/logic';
import { kvGet, kvSet } from './storage';

const KEY = 'onboardingAnswers';

export interface OnboardingAnswers {
  childName?: string;
  /** Question id → the choice's id. */
  pains?: Record<string, string>;
  reminderTime?: string; // HH:MM
  reminderDays?: string[];
}

export async function getOnboardingAnswers(): Promise<OnboardingAnswers> {
  return parseJson<OnboardingAnswers>(await kvGet(KEY)) ?? {};
}

export async function saveOnboardingAnswers(patch: Partial<OnboardingAnswers>): Promise<OnboardingAnswers> {
  const next = { ...(await getOnboardingAnswers()), ...patch };
  await kvSet(KEY, JSON.stringify(next));
  return next;
}
