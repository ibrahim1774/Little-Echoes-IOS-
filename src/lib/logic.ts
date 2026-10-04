/**
 * Pure logic shared by the services. No I/O here so it can be unit tested.
 */
import type {
  AgeGroup,
  ChildProfile,
  Question,
  QuestionCategory,
  Recording,
  Streak,
  Tier,
  VideoClip,
} from '@/types';

// ── Dates ─────────────────────────────────────────────────────

/** Local calendar date as YYYY-MM-DD. */
export function toDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from a to b (both YYYY-MM-DD), ignoring DST shifts. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function calcAgeGroup(birthdate: string, now: Date = new Date()): AgeGroup {
  const [by, bm] = birthdate.split('-').map(Number);
  const ageMonths = (now.getFullYear() - by) * 12 + (now.getMonth() + 1 - bm);
  const years = Math.floor(ageMonths / 12);
  if (years <= 2) return '1-2';
  if (years <= 4) return '3-4';
  if (years <= 6) return '5-6';
  if (years <= 9) return '7-9';
  return '10-12';
}

// ── Streaks ───────────────────────────────────────────────────

export function nextStreak(existing: Streak | undefined, childId: string, todayStr: string): Streak {
  if (!existing) {
    return { childId, currentStreak: 1, longestStreak: 1, lastRecordingDate: todayStr };
  }
  const diffDays = daysBetween(existing.lastRecordingDate, todayStr);
  let currentStreak = existing.currentStreak;
  if (diffDays === 1) currentStreak += 1;
  else if (diffDays !== 0) currentStreak = 1; // streak broken
  return {
    childId,
    currentStreak,
    longestStreak: Math.max(existing.longestStreak, currentStreak),
    lastRecordingDate: todayStr,
  };
}

// ── Question selection ────────────────────────────────────────

const CATEGORIES: QuestionCategory[] = ['favorites', 'challenges', 'emotions', 'learning', 'gratitude'];

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick up to 3 questions for a child: one from each of 3 random categories,
 * avoiding anything asked in the last 14 days when enough remain.
 */
export function pickQuestions(
  allQuestions: Question[],
  child: Pick<ChildProfile, 'ageGroup'>,
  recentQuestionIds: Set<string>,
  random: () => number = Math.random
): Question[] {
  const ageAppropriate = allQuestions.filter((q) => q.ageGroups.includes(child.ageGroup));
  const eligible = ageAppropriate.filter((q) => !recentQuestionIds.has(q.id));
  const pool = eligible.length >= 3 ? eligible : ageAppropriate;

  const selected: Question[] = [];
  for (const cat of shuffle(CATEGORIES, random).slice(0, 3)) {
    const catPool = pool.filter((q) => q.category === cat);
    if (catPool.length > 0) selected.push(catPool[Math.floor(random() * catPool.length)]);
  }
  if (selected.length < 3) {
    const usedIds = new Set(selected.map((q) => q.id));
    const remaining = shuffle(pool.filter((q) => !usedIds.has(q.id)), random);
    selected.push(...remaining.slice(0, 3 - selected.length));
  }
  return selected.slice(0, 3);
}

// ── Subscription ──────────────────────────────────────────────

// Admin emails get unconditional Pro access — bypass paywall and tier gating.
const ADMIN_EMAILS = new Set(['ibrahim3709@gmail.com']);

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

export function resolveTier(
  activeEntitlementIds: string[],
  email: string | null | undefined
): { isPaid: boolean; tier: Tier | null } {
  if (isAdmin(email) || activeEntitlementIds.includes('pro')) return { isPaid: true, tier: 'pro' };
  if (activeEntitlementIds.includes('basic')) return { isPaid: true, tier: 'basic' };
  return { isPaid: false, tier: null };
}

// ── Media ─────────────────────────────────────────────────────

export function audioExt(mimeType?: string): 'wav' | 'mp4' | 'webm' {
  if (mimeType?.includes('wav')) return 'wav';
  if (mimeType?.includes('mp4') || mimeType?.includes('m4a') || mimeType?.includes('aac')) return 'mp4';
  return 'webm';
}

export function audioContentType(mimeType?: string): string {
  const ext = audioExt(mimeType);
  return ext === 'wav' ? 'audio/wav' : ext === 'mp4' ? 'audio/mp4' : 'audio/webm';
}

export function videoExt(mimeType?: string): 'mp4' | 'webm' {
  return mimeType?.includes('mp4') || mimeType?.includes('quicktime') ? 'mp4' : 'webm';
}

/** iOS cannot decode WebM/Ogg, which Chrome and Android browsers record. */
export function isPlayableOnIOS(mimeType?: string, remotePath?: string): boolean {
  const hint = `${mimeType ?? ''} ${remotePath ?? ''}`.toLowerCase();
  return !(hint.includes('webm') || hint.includes('ogg'));
}

export function isFreeRecording(rec: Pick<Recording, 'questionId' | 'questionText'>): boolean {
  return (
    rec.questionId.startsWith('free-') ||
    rec.questionText === 'Custom audio' ||
    rec.questionText === 'Free recording'
  );
}

// ── Cloud row mapping (must match the web app's cloudSync.ts) ──

export interface CloudRow {
  id: string;
  user_id: string;
  data: string;
  created_at: string;
}

export function recordingToRow(r: Recording, userId: string, audioUrl: string | undefined): CloudRow {
  return {
    id: r.id,
    user_id: userId,
    data: JSON.stringify({
      sessionId: r.sessionId,
      childId: r.childId,
      questionId: r.questionId,
      questionText: r.questionText,
      durationSeconds: r.durationSeconds,
      mimeType: r.mimeType,
      transcription: r.transcription,
      emotionTag: r.emotionTag,
      parentNote: r.parentNote,
      createdAt: r.createdAt,
      audioUrl,
    }),
    created_at: r.createdAt,
  };
}

export function videoToRow(v: VideoClip, userId: string, videoUrl: string | undefined): CloudRow {
  return {
    id: v.id,
    user_id: userId,
    data: JSON.stringify({
      childId: v.childId,
      date: v.date,
      durationSeconds: v.durationSeconds,
      mimeType: v.mimeType,
      caption: v.caption,
      createdAt: v.createdAt,
      videoUrl,
    }),
    created_at: v.createdAt,
  };
}

/** The web stores jsonb columns as JSON strings; tolerate both. */
export function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function rowToRecording(row: { id: string; data: unknown }): Recording | null {
  const meta = parseJson<Omit<Recording, 'id'>>(row.data);
  if (!meta || !meta.childId) return null;
  // Never trust a device-local path that came from another device.
  const { localUri: _ignored, ...rest } = meta as Recording;
  return { ...rest, id: row.id };
}

export function rowToVideo(row: { id: string; data: unknown }): VideoClip | null {
  const meta = parseJson<Omit<VideoClip, 'id'>>(row.data);
  if (!meta || !meta.childId) return null;
  const { localUri: _ignored, ...rest } = meta as VideoClip;
  return { ...rest, id: row.id };
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
