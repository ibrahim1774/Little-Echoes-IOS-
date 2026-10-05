/**
 * Storage service — local SQLite document store.
 * Function names and behaviour mirror the web app's storage.ts.
 */
import { ensureSeeded, getStore } from './db';
import { calcAgeGroup, nextStreak, pickQuestions, toDateStr } from '@/lib/logic';
import type {
  ChildProfile,
  ParentProfile,
  Question,
  Recording,
  RecordingSession,
  Streak,
  VideoClip,
} from '@/types';

export { calcAgeGroup };

const byCreatedDesc = <T extends { createdAt: string }>(a: T, b: T) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
const byCreatedAsc = <T extends { createdAt: string }>(a: T, b: T) => -byCreatedDesc(a, b);

// ── Key/value (small flags and caches) ────────────────────────

export async function kvGet(key: string): Promise<string | null> {
  const row = await getStore().get<{ value: string }>('kv', key);
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await getStore().put('kv', key, { value });
}

export async function kvRemove(key: string): Promise<void> {
  await getStore().delete('kv', key);
}

// ── Parent ────────────────────────────────────────────────────

export async function getParent(): Promise<ParentProfile | undefined> {
  const all = await getStore().all<ParentProfile>('parents');
  return all.sort(byCreatedAsc)[0];
}

export async function saveParent(parent: ParentProfile): Promise<void> {
  await getStore().put('parents', parent.id, parent);
}

// ── Children ──────────────────────────────────────────────────

export async function getChildren(parentId: string): Promise<ChildProfile[]> {
  const all = await getStore().all<ChildProfile>('children');
  return all.filter((c) => c.parentId === parentId).sort(byCreatedAsc);
}

export async function saveChild(child: ChildProfile): Promise<void> {
  await getStore().put('children', child.id, child);
}

export async function deleteChild(id: string): Promise<void> {
  await getStore().delete('children', id);
}

// ── Custom Questions ──────────────────────────────────────────

export async function saveCustomQuestion(question: Question): Promise<void> {
  await getStore().put('questions', question.id, question);
}

export async function deleteQuestion(id: string): Promise<void> {
  await getStore().delete('questions', id);
}

export async function getCustomQuestions(parentId: string): Promise<Question[]> {
  const all = await getStore().all<Question>('questions');
  return all.filter((q) => q.createdBy === parentId);
}

// ── Reset ─────────────────────────────────────────────────────

/**
 * Remove everything tied to the signed-in family. Custom questions stay: they
 * aren't stored in the cloud, and they only appear for the parent who wrote them.
 */
export async function clearAllData(): Promise<void> {
  const s = getStore();
  await Promise.all([
    s.clear('parents'),
    s.clear('children'),
    s.clear('sessions'),
    s.clear('recordings'),
    s.clear('streaks'),
    s.clear('videos'),
    s.clear('kv'),
  ]);
}

// ── Sessions ──────────────────────────────────────────────────

export async function getTodaySession(childId: string): Promise<RecordingSession | undefined> {
  const today = toDateStr();
  const all = await getStore().all<RecordingSession>('sessions');
  return all.find((s) => s.childId === childId && s.date === today);
}

export async function saveSession(session: RecordingSession): Promise<void> {
  await getStore().put('sessions', session.id, session);
}

export async function getSessionsByChild(childId: string): Promise<RecordingSession[]> {
  const all = await getStore().all<RecordingSession>('sessions');
  return all.filter((s) => s.childId === childId).sort(byCreatedDesc);
}

export async function getAllSessions(): Promise<RecordingSession[]> {
  return getStore().all<RecordingSession>('sessions');
}

// ── Recordings ────────────────────────────────────────────────

export async function saveRecording(recording: Recording): Promise<void> {
  await getStore().put('recordings', recording.id, recording);
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return getStore().get<Recording>('recordings', id);
}

export async function getAllRecordings(): Promise<Recording[]> {
  return getStore().all<Recording>('recordings');
}

export async function getRecordingsBySession(sessionId: string): Promise<Recording[]> {
  const all = await getAllRecordings();
  return all.filter((r) => r.sessionId === sessionId).sort(byCreatedAsc);
}

export async function getRecordingsByChild(childId: string): Promise<Recording[]> {
  const all = await getAllRecordings();
  return all.filter((r) => r.childId === childId).sort(byCreatedDesc);
}

export async function getTodayRecordingCount(childId: string): Promise<number> {
  const today = toDateStr();
  const all = await getAllRecordings();
  return all.filter((r) => r.childId === childId && toDateStr(new Date(r.createdAt)) === today).length;
}

export async function deleteRecording(id: string): Promise<void> {
  await getStore().delete('recordings', id);
}

export async function getRecordingsByQuestion(childId: string, questionId: string): Promise<Recording[]> {
  const all = await getAllRecordings();
  return all.filter((r) => r.childId === childId && r.questionId === questionId).sort(byCreatedAsc);
}

// ── Streaks ───────────────────────────────────────────────────

export async function getStreak(childId: string): Promise<Streak | undefined> {
  return getStore().get<Streak>('streaks', childId);
}

export async function saveStreak(streak: Streak): Promise<void> {
  await getStore().put('streaks', streak.childId, streak);
}

export async function updateStreak(childId: string): Promise<Streak> {
  const updated = nextStreak(await getStreak(childId), childId, toDateStr());
  await getStore().put('streaks', childId, updated);
  return updated;
}

// ── Question selection ────────────────────────────────────────

export async function getQuestionsForChild(child: ChildProfile): Promise<Question[]> {
  await ensureSeeded();
  const s = getStore();

  // Same questions all day, new ones tomorrow.
  const cacheKey = `questions-${child.id}-${toDateStr()}`;
  const cached = await kvGet(cacheKey);
  if (cached) {
    try {
      const ids = JSON.parse(cached) as string[];
      const found = await Promise.all(ids.map((id) => s.get<Question>('questions', id)));
      const valid = found.filter((q): q is Question => q != null);
      if (valid.length > 0) return valid;
    } catch {
      // cache unreadable — pick fresh
    }
  }

  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const recent = (await getAllRecordings()).filter(
    (r) => r.childId === child.id && new Date(r.createdAt).getTime() > fourteenDaysAgo
  );
  const allQuestions = await s.all<Question>('questions');
  const result = pickQuestions(allQuestions, child, new Set(recent.map((r) => r.questionId)));

  await kvSet(cacheKey, JSON.stringify(result.map((q) => q.id)));
  return result;
}

// ── Videos ────────────────────────────────────────────────────

export async function saveVideo(video: VideoClip): Promise<void> {
  await getStore().put('videos', video.id, video);
}

export async function getVideo(id: string): Promise<VideoClip | undefined> {
  return getStore().get<VideoClip>('videos', id);
}

export async function getAllVideos(): Promise<VideoClip[]> {
  return getStore().all<VideoClip>('videos');
}

export async function getVideosByChild(childId: string): Promise<VideoClip[]> {
  const all = await getAllVideos();
  return all.filter((v) => v.childId === childId).sort(byCreatedDesc);
}

export async function getTodayVideo(childId: string): Promise<VideoClip | undefined> {
  const today = toDateStr();
  const all = await getAllVideos();
  return all.find((v) => v.childId === childId && v.date === today);
}

export async function deleteVideo(id: string): Promise<void> {
  await getStore().delete('videos', id);
}
