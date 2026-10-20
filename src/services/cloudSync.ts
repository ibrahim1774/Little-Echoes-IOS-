/**
 * Cloud sync with Supabase. Row shapes and storage paths match the web app's
 * cloudSync.ts so one account works on both clients.
 */
import { supabase } from './supabase';
import { deleteFile, downloadTo, fileExists, readBytes, resolveMediaUri } from './files';
import {
  deleteRecording,
  deleteVideo,
  getAllRecordings,
  getAllSessions,
  getAllVideos,
  getChildren,
  getParent,
  getRecording,
  getStreak,
  getVideo,
  kvGet,
  kvSet,
  saveChild,
  saveParent,
  saveRecording,
  saveSession,
  saveStreak,
  saveVideo,
} from './storage';
import {
  audioContentType,
  audioExt,
  parseJson,
  recordingToRow,
  rowToRecording,
  rowToVideo,
  streakFromDates,
  toDateStr,
  videoExt,
  videoToRow,
} from '@/lib/logic';
import type { AuthUser, ChildProfile, ParentProfile, RecordingSession, Tier } from '@/types';

const STORAGE_BUCKET = 'recordings';
const VIDEO_BUCKET = 'videos';
const PENDING_DELETES = 'pendingCloudDeletes';

let syncing: Promise<void> | null = null;
let syncAgain = false;

// ── Deletes waiting to reach the cloud ────────────────────────
// A delete is remembered on the device until the cloud confirms it, so a failed
// delete is retried and the item isn't restored from the cloud in the meantime.

interface PendingDelete {
  kind: 'recording' | 'video';
  id: string;
  path?: string;
}

export async function getPendingDeletes(): Promise<PendingDelete[]> {
  return parseJson<PendingDelete[]>(await kvGet(PENDING_DELETES)) ?? [];
}

async function setPendingDeletes(list: PendingDelete[]): Promise<void> {
  await kvSet(PENDING_DELETES, JSON.stringify(list));
}

async function flushPendingDeletes(user: AuthUser): Promise<void> {
  const pending = await getPendingDeletes();
  if (pending.length === 0) return;
  const left: PendingDelete[] = [];
  for (const item of pending) {
    const table = item.kind === 'recording' ? 'recordings' : 'videos';
    const bucket = item.kind === 'recording' ? STORAGE_BUCKET : VIDEO_BUCKET;
    try {
      const { error } = await supabase.from(table).delete().eq('id', item.id).eq('user_id', user.id);
      const removed = !error && (!item.path || !(await supabase.storage.from(bucket).remove([item.path])).error);
      if (!removed) left.push(item);
    } catch {
      left.push(item);
    }
  }
  // Deletes queued while this ran must survive.
  const now = await getPendingDeletes();
  const done = new Set(pending.filter((p) => !left.includes(p)).map((p) => p.id));
  await setPendingDeletes(now.filter((p) => !done.has(p.id)));
}

/** Delete a recording here and in the cloud. */
export async function removeRecording(user: AuthUser | null, recordingId: string): Promise<void> {
  const rec = await getRecording(recordingId);
  if (!rec) return;
  deleteFile(rec.localUri);
  await deleteRecording(recordingId);
  await setPendingDeletes([...(await getPendingDeletes()), { kind: 'recording', id: rec.id, path: rec.audioUrl }]);
  if (user) await flushPendingDeletes(user);
}

/** Delete a video here and in the cloud. */
export async function removeVideo(user: AuthUser | null, videoId: string): Promise<void> {
  const clip = await getVideo(videoId);
  if (!clip) return;
  deleteFile(clip.localUri);
  await deleteVideo(videoId);
  await setPendingDeletes([...(await getPendingDeletes()), { kind: 'video', id: clip.id, path: clip.videoUrl }]);
  if (user) await flushPendingDeletes(user);
}

/** Merge this device's children into the cloud's list; a child is never dropped. */
function mergeChildren(cloud: ChildProfile[], local: ChildProfile[]): ChildProfile[] {
  const byId = new Map(cloud.filter((c) => c?.id).map((c) => [c.id, c]));
  for (const c of local) byId.set(c.id, c);
  return [...byId.values()];
}

/**
 * Upload profile, children, recordings, sessions and videos.
 * Calls made while a sync is running are coalesced into one follow-up run.
 */
export function syncToCloud(user: AuthUser): Promise<void> {
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        syncAgain = false;
        await runSync(user);
      } while (syncAgain);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function runSync(user: AuthUser): Promise<void> {
  try {
    await flushPendingDeletes(user);

    const parent = await getParent();
    if (!parent) return;
    const children = await getChildren(parent.id);

    // Read before writing: another device may have added children, and a failed read
    // must never lead to overwriting the family with what this device happens to hold.
    const { data: cloudProfile, error: readError } = await supabase
      .from('profiles')
      .select('children')
      .eq('id', user.id)
      .maybeSingle();
    if (readError) {
      console.warn('[syncToCloud] Profile read failed; not writing it:', readError.message);
    } else {
      const cloudChildren = parseJson<ChildProfile[]>(cloudProfile?.children) ?? [];
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        parent: JSON.stringify(parent),
        children: JSON.stringify(mergeChildren(Array.isArray(cloudChildren) ? cloudChildren : [], children)),
      });
      if (profileError) console.warn('[syncToCloud] Profile upsert failed:', profileError.message);
    }

    const recordings = await getAllRecordings();
    if (recordings.length > 0) {
      const rows = [];
      for (const r of recordings) {
        let audioUrl = r.audioUrl;
        if (!audioUrl && fileExists(r.localUri)) {
          const path = `${user.id}/${r.id}.${audioExt(r.mimeType)}`;
          const { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, await readBytes(r.localUri!), { contentType: audioContentType(r.mimeType), upsert: true });
          if (!error) {
            audioUrl = path;
            // The recording may have been deleted while uploading — don't resurrect it.
            const current = await getRecording(r.id);
            if (current) await saveRecording({ ...current, audioUrl: path });
          } else {
            console.warn(`[syncToCloud] Audio upload failed for ${r.id}:`, error.message);
          }
        }
        if (await getRecording(r.id)) rows.push(recordingToRow(r, user.id, audioUrl));
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('recordings').upsert(rows);
        if (error) console.warn('[syncToCloud] Recordings upsert failed:', error.message);
        else await markSynced(rows, getRecording, saveRecording);
      }
    }

    const sessions = await getAllSessions();
    if (sessions.length > 0) {
      const { error } = await supabase.from('sessions').upsert(
        sessions.map((s) => ({ id: s.id, user_id: user.id, data: JSON.stringify(s), created_at: s.createdAt }))
      );
      if (error) console.warn('[syncToCloud] Sessions upsert failed:', error.message);
    }

    const videos = await getAllVideos();
    if (videos.length > 0) {
      const rows = [];
      for (const v of videos) {
        let videoUrl = v.videoUrl;
        if (!videoUrl && fileExists(v.localUri)) {
          const ext = videoExt(v.mimeType);
          const path = `${user.id}/${v.id}.${ext}`;
          const { error } = await supabase.storage
            .from(VIDEO_BUCKET)
            .upload(path, await readBytes(v.localUri!), { contentType: `video/${ext}`, upsert: true });
          if (!error) {
            videoUrl = path;
            const current = await getVideo(v.id);
            if (current) await saveVideo({ ...current, videoUrl: path });
          } else {
            console.warn(`[syncToCloud] Video upload failed for ${v.id}:`, error.message);
          }
        }
        if (await getVideo(v.id)) rows.push(videoToRow(v, user.id, videoUrl));
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('videos').upsert(rows);
        if (error) console.warn('[syncToCloud] Videos upsert failed:', error.message);
        else await markSynced(rows, getVideo, saveVideo);
      }
    }

    // A delete made while this sync was uploading may have just been undone by the upsert.
    await flushPendingDeletes(user);
  } catch (err) {
    console.warn('[syncToCloud] Sync failed:', err);
  }
}

/** Remember that these rows are in the cloud, so a later absence means "deleted elsewhere". */
async function markSynced<T extends { rowSynced?: boolean; audioUrl?: string; videoUrl?: string }>(
  rows: { id: string; data: string }[],
  get: (id: string) => Promise<T | undefined>,
  save: (item: T) => Promise<void>
): Promise<void> {
  for (const row of rows) {
    const current = await get(row.id);
    const sent = parseJson<{ audioUrl?: string; videoUrl?: string }>(row.data);
    // Only a row that carried the media path counts; otherwise the next sync must send it again.
    if (current && !current.rowSynced && (sent?.audioUrl || sent?.videoUrl)) await save({ ...current, rowSynced: true });
  }
}

/**
 * Pull profile, children, recordings, sessions and videos into the local store.
 * Local items that were uploaded before and are now missing from the cloud were
 * deleted on another device, so they are removed here too. Items never uploaded
 * are kept — they are still waiting to sync.
 */
export async function loadFromCloud(user: AuthUser): Promise<{ profileLoaded: boolean }> {
  // A sync in flight may have uploaded files whose rows aren't written yet.
  if (syncing) await syncing.catch(() => {});
  let profileLoaded = false;
  try {
    const pendingIds = new Set((await getPendingDeletes()).map((p) => p.id));
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('parent, children')
      .eq('id', user.id)
      .maybeSingle();
    profileLoaded = !profileError;

    if (data) {
      const parent = parseJson<ParentProfile>(data.parent);
      if (parent?.id) await saveParent(parent);
      const children = parseJson<ChildProfile[]>(data.children);
      if (Array.isArray(children)) for (const child of children) if (child?.id) await saveChild(child);
    }

    const { data: recordings, error: recError } = await supabase
      .from('recordings')
      .select('id, data, created_at')
      .eq('user_id', user.id);

    if (!recError && recordings) {
      const cloudIds = new Set<string>();
      for (const row of recordings) {
        cloudIds.add(row.id);
        if (pendingIds.has(row.id)) continue;
        const incoming = rowToRecording(row);
        if (!incoming) continue;
        const existing = await getRecording(row.id);
        if (!existing) await saveRecording({ ...incoming, rowSynced: true });
        else if (incoming.audioUrl && (!existing.audioUrl || !existing.rowSynced)) {
          await saveRecording({ ...existing, audioUrl: existing.audioUrl ?? incoming.audioUrl, rowSynced: true });
        }
      }
      for (const local of await getAllRecordings()) {
        // Only something known to have been in the cloud can have been deleted there.
        if (!cloudIds.has(local.id) && local.rowSynced) {
          deleteFile(local.localUri);
          await deleteRecording(local.id);
        }
      }
    }

    const { data: sessions } = await supabase.from('sessions').select('id, data, created_at').eq('user_id', user.id);
    if (sessions) {
      const have = new Set((await getAllSessions()).map((s) => s.id));
      for (const row of sessions) {
        const session = parseJson<RecordingSession>(row.data);
        if (session?.id && !have.has(session.id)) await saveSession(session);
      }
      await rebuildStreaks();
    }

    const { data: cloudVideos, error: vidError } = await supabase
      .from('videos')
      .select('id, data, created_at')
      .eq('user_id', user.id);

    if (!vidError && cloudVideos) {
      const cloudIds = new Set<string>();
      for (const row of cloudVideos) {
        cloudIds.add(row.id);
        if (pendingIds.has(row.id)) continue;
        const incoming = rowToVideo(row);
        if (!incoming) continue;
        const existing = await getVideo(row.id);
        if (!existing) await saveVideo({ ...incoming, rowSynced: true });
        else if (incoming.videoUrl && (!existing.videoUrl || !existing.rowSynced)) {
          await saveVideo({ ...existing, videoUrl: existing.videoUrl ?? incoming.videoUrl, rowSynced: true });
        }
      }
      for (const local of await getAllVideos()) {
        if (!cloudIds.has(local.id) && local.rowSynced) {
          deleteFile(local.localUri);
          await deleteVideo(local.id);
        }
      }
    }
  } catch (err) {
    console.warn('[loadFromCloud] Load failed:', err);
  }
  return { profileLoaded };
}

/** Streaks aren't stored in the cloud; derive them from completed sessions. */
async function rebuildStreaks(): Promise<void> {
  const byChild = new Map<string, string[]>();
  for (const s of await getAllSessions()) {
    if (s.status !== 'completed') continue;
    byChild.set(s.childId, [...(byChild.get(s.childId) ?? []), s.date]);
  }
  const today = toDateStr();
  for (const [childId, dates] of byChild) {
    const rebuilt = streakFromDates(childId, dates, today);
    if (!rebuilt) continue;
    const existing = await getStreak(childId);
    if (!existing || existing.lastRecordingDate < rebuilt.lastRecordingDate || existing.longestStreak < rebuilt.longestStreak) {
      await saveStreak(rebuilt);
    }
  }
}

async function download(bucket: string, remotePath: string, id: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(remotePath, 300);
    if (error || !data?.signedUrl) {
      console.warn('[download] Could not sign', remotePath, error?.message);
      return null;
    }
    const ext = remotePath.split('.').pop() || 'bin';
    return await downloadTo(data.signedUrl, id, ext);
  } catch (err) {
    console.warn('[download] Failed:', remotePath, err);
    return null;
  }
}

/** Ensure a recording's audio is on this device. Returns a local URI or null. */
export async function ensureLocalAudio(recordingId: string): Promise<string | null> {
  const rec = await getRecording(recordingId);
  if (!rec) return null;
  if (fileExists(rec.localUri)) return resolveMediaUri(rec.localUri!);
  if (!rec.audioUrl) return null;
  const uri = await download(STORAGE_BUCKET, rec.audioUrl, rec.id);
  if (uri) await saveRecording({ ...rec, localUri: uri });
  return uri;
}

/** Ensure a video is on this device. Returns a local URI or null. */
export async function ensureLocalVideo(videoId: string): Promise<string | null> {
  const clip = await getVideo(videoId);
  if (!clip) return null;
  if (fileExists(clip.localUri)) return resolveMediaUri(clip.localUri!);
  if (!clip.videoUrl) return null;
  const uri = await download(VIDEO_BUCKET, clip.videoUrl, clip.id);
  if (uri) await saveVideo({ ...clip, localUri: uri });
  return uri;
}

/** Record the subscription on the profile so the web app sees iOS subscribers. */
export async function writeSubscriptionToProfile(user: AuthUser, isPaid: boolean, tier: Tier | null): Promise<void> {
  try {
    const { error } = await supabase.from('profiles').upsert({ id: user.id, paid: isPaid, tier });
    if (error) console.warn('[writeSubscriptionToProfile]', error.message);
  } catch (err) {
    console.warn('[writeSubscriptionToProfile]', err);
  }
}
