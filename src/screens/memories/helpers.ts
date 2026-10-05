import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';

import { audioContentType, isFreeRecording, videoExt } from '@/lib/logic';
import { ensureLocalAudio, ensureLocalVideo } from '@/services/cloudSync';
import type { Recording, RecordingSession, VideoClip } from '@/types';

export type ViewMode = 'timeline' | 'calendar' | 'growth';
export type MediaType = 'all' | 'audio' | 'video';
export type GrowthRange = '3m' | '6m' | '1y' | 'all';

export interface GroupedSession {
  session: RecordingSession;
  recordings: Recording[];
}

export type TimelineRow =
  | { kind: 'header'; key: string; date: string; first: boolean }
  | { kind: 'recording'; key: string; rec: Recording }
  | { kind: 'video'; key: string; clip: VideoClip };

export interface MontageEntry {
  rec: Recording;
  windowStart: Date;
  windowEnd: Date;
  windowRecCount: number;
}

export const LOAD_ERROR = "Couldn't load this recording. Check your connection.";
export const NOT_PLAYABLE = 'Recorded on another device — not playable here';

export const EMOTION_EMOJIS: Record<string, string> = {
  happy: '😄', silly: '🤪', thoughtful: '🤔', shy: '😊', excited: '🤩', sad: '😢',
};

export const CATEGORY_CHIPS: { key: string | null; label: string; icon: string }[] = [
  { key: null,          label: 'All',        icon: '✨' },
  { key: 'favorites',   label: 'Favorites',  icon: '🎯' },
  { key: 'challenges',  label: 'Challenges', icon: '💪' },
  { key: 'emotions',    label: 'Emotions',   icon: '💜' },
  { key: 'learning',    label: 'Learning',   icon: '🌱' },
  { key: 'gratitude',   label: 'Gratitude',  icon: '💛' },
  { key: 'free',        label: 'Free',       icon: '🎙️' },
];

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
export const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

export function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function categoryOf(rec: Recording): string {
  return rec.questionId.split('-')[0];
}

export function recordingTitle(rec: Recording): string {
  return rec.parentNote || (isFreeRecording(rec) ? 'Custom audio' : rec.questionText);
}

export function recordingSubtitle(rec: Recording): string {
  return isFreeRecording(rec) ? 'Custom audio' : 'Question of the day';
}

export function buildGroups(sessions: RecordingSession[], recordings: Recording[]): GroupedSession[] {
  const recordingMap = new Map<string, Recording[]>();
  for (const rec of recordings) {
    const arr = recordingMap.get(rec.sessionId) ?? [];
    arr.push(rec);
    recordingMap.set(rec.sessionId, arr);
  }
  // One group per day: a parent can run several sessions (questions, free
  // recordings) on the same date, and they belong under one heading.
  const byDate = new Map<string, GroupedSession>();
  for (const s of sessions) {
    const recs = recordingMap.get(s.id) ?? [];
    if (recs.length === 0) continue;
    const existing = byDate.get(s.date);
    if (existing) existing.recordings.push(...recs);
    else byDate.set(s.date, { session: s, recordings: [...recs] });
  }
  for (const group of byDate.values()) {
    group.recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return [...byDate.values()].sort((a, b) => b.session.date.localeCompare(a.session.date));
}

export function applyFilter(groups: GroupedSession[], cat: string | null): GroupedSession[] {
  if (!cat) return groups;
  return groups
    .map((g) => ({ ...g, recordings: g.recordings.filter((r) => categoryOf(r) === cat) }))
    .filter((g) => g.recordings.length > 0);
}

/** Audio sessions and video clips interleaved by date, flattened for a virtualised list. */
export function buildTimelineRows(
  groups: GroupedSession[],
  videos: VideoClip[],
  mediaType: MediaType,
  activeCategory: string | null
): TimelineRow[] {
  type Entry =
    | { type: 'session'; date: string; session: RecordingSession; recordings: Recording[] }
    | { type: 'video'; date: string; clips: VideoClip[] };

  const entries: Entry[] = [];
  if (mediaType !== 'video') {
    for (const g of applyFilter(groups, activeCategory)) {
      entries.push({ type: 'session', date: g.session.date, session: g.session, recordings: g.recordings });
    }
  }
  if (mediaType !== 'audio') {
    const videosByDate = new Map<string, VideoClip[]>();
    for (const v of videos) {
      const arr = videosByDate.get(v.date) ?? [];
      arr.push(v);
      videosByDate.set(v.date, arr);
    }
    for (const [date, clips] of videosByDate) entries.push({ type: 'video', date, clips });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));

  const rows: TimelineRow[] = [];
  for (const entry of entries) {
    const first = rows.length === 0;
    if (entry.type === 'session') {
      rows.push({ kind: 'header', key: `h-${entry.session.id}`, date: entry.date, first });
      for (const rec of entry.recordings) rows.push({ kind: 'recording', key: rec.id, rec });
    } else {
      rows.push({ kind: 'header', key: `h-video-${entry.date}`, date: entry.date, first });
      for (const clip of entry.clips) rows.push({ kind: 'video', key: clip.id, clip });
    }
  }
  return rows;
}

/** One recording per interval window across the chosen time range, oldest first. */
export function buildGrowthMontage(
  groups: GroupedSession[],
  range: GrowthRange,
  intervalDays: number,
  childId: string,
  shuffleSeed: number
): MontageEntry[] {
  const allRecs = groups.flatMap((g) => g.recordings).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (allRecs.length === 0) return [];

  const cutoff = new Date();
  if (range === '3m') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  else cutoff.setFullYear(2000);

  const filtered = allRecs.filter((r) => new Date(r.createdAt) >= cutoff);
  if (filtered.length === 0) return [];

  const startDate = new Date(filtered[0].createdAt);
  const endDate = new Date(filtered[filtered.length - 1].createdAt);
  const msPerDay = 86400000;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
  const windowCount = Math.max(1, Math.ceil(totalDays / intervalDays));

  const montage: MontageEntry[] = [];
  for (let w = 0; w < windowCount; w++) {
    const windowStart = new Date(startDate.getTime() + w * intervalDays * msPerDay);
    const windowEnd = new Date(windowStart.getTime() + intervalDays * msPerDay);
    const windowRecs = filtered.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= windowStart && d < windowEnd;
    });
    if (windowRecs.length > 0) {
      // Pick using child ID + window index + shuffle seed
      const seed = childId.length + w + shuffleSeed * 7;
      montage.push({
        rec: windowRecs[seed % windowRecs.length],
        windowStart,
        windowEnd,
        windowRecCount: windowRecs.length,
      });
    }
  }
  return montage;
}

async function share(uri: string | null, mimeType: string): Promise<void> {
  if (!uri) {
    Alert.alert(LOAD_ERROR);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) return;
  try {
    await Sharing.shareAsync(uri, { mimeType });
  } catch {
    // share sheet dismissed
  }
}

export async function shareRecording(rec: Recording): Promise<void> {
  await share(await ensureLocalAudio(rec.id), audioContentType(rec.mimeType));
}

export async function shareVideo(clip: VideoClip): Promise<void> {
  await share(await ensureLocalVideo(clip.id), videoExt(clip.mimeType) === 'mp4' ? 'video/mp4' : 'video/webm');
}
