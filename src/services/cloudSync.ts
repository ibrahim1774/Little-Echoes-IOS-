/**
 * Cloud sync with Supabase. Row shapes and storage paths match the web app's
 * cloudSync.ts so one account works on both clients.
 */
import { supabase } from './supabase';
import { deleteFile, downloadTo, fileExists, readBytes } from './files';
import {
  deleteRecording,
  deleteVideo,
  getAllRecordings,
  getAllSessions,
  getAllVideos,
  getChildren,
  getParent,
  getRecording,
  getVideo,
  saveChild,
  saveParent,
  saveRecording,
  saveSession,
  saveVideo,
} from './storage';
import {
  audioContentType,
  audioExt,
  parseJson,
  recordingToRow,
  rowToRecording,
  rowToVideo,
  videoExt,
  videoToRow,
} from '@/lib/logic';
import type { AuthUser, ChildProfile, ParentProfile, RecordingSession, Tier } from '@/types';

const STORAGE_BUCKET = 'recordings';
const VIDEO_BUCKET = 'videos';

let syncing: Promise<void> | null = null;
let syncAgain = false;

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
    const parent = await getParent();
    if (!parent) return;
    const children = await getChildren(parent.id);

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      parent: JSON.stringify(parent),
      children: JSON.stringify(children),
    });
    if (profileError) console.warn('[syncToCloud] Profile upsert failed:', profileError.message);

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
      }
    }
  } catch (err) {
    console.warn('[syncToCloud] Sync failed:', err);
  }
}

/**
 * Pull profile, children, recordings, sessions and videos into the local store.
 * Local items that were uploaded before and are now missing from the cloud were
 * deleted on another device, so they are removed here too. Items never uploaded
 * are kept — they are still waiting to sync.
 */
export async function loadFromCloud(user: AuthUser): Promise<void> {
  try {
    const { data } = await supabase.from('profiles').select('parent, children').eq('id', user.id).maybeSingle();

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
        const incoming = rowToRecording(row);
        if (!incoming) continue;
        const existing = await getRecording(row.id);
        if (!existing) await saveRecording(incoming);
        else if (incoming.audioUrl && !existing.audioUrl) await saveRecording({ ...existing, audioUrl: incoming.audioUrl });
      }
      for (const local of await getAllRecordings()) {
        if (!cloudIds.has(local.id) && local.audioUrl) {
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
    }

    const { data: cloudVideos, error: vidError } = await supabase
      .from('videos')
      .select('id, data, created_at')
      .eq('user_id', user.id);

    if (!vidError && cloudVideos) {
      const cloudIds = new Set<string>();
      for (const row of cloudVideos) {
        cloudIds.add(row.id);
        const incoming = rowToVideo(row);
        if (!incoming) continue;
        const existing = await getVideo(row.id);
        if (!existing) await saveVideo(incoming);
        else if (incoming.videoUrl && !existing.videoUrl) await saveVideo({ ...existing, videoUrl: incoming.videoUrl });
      }
      for (const local of await getAllVideos()) {
        if (!cloudIds.has(local.id) && local.videoUrl) {
          deleteFile(local.localUri);
          await deleteVideo(local.id);
        }
      }
    }
  } catch (err) {
    console.warn('[loadFromCloud] Load failed:', err);
  }
}

export async function deleteRecordingFromCloud(user: AuthUser, recordingId: string, audioUrl?: string): Promise<void> {
  try {
    await supabase.from('recordings').delete().eq('id', recordingId).eq('user_id', user.id);
    if (audioUrl) await supabase.storage.from(STORAGE_BUCKET).remove([audioUrl]);
  } catch {
    // Best-effort
  }
}

export async function deleteVideoFromCloud(user: AuthUser, videoId: string, videoUrl?: string): Promise<void> {
  try {
    await supabase.from('videos').delete().eq('id', videoId).eq('user_id', user.id);
    if (videoUrl) await supabase.storage.from(VIDEO_BUCKET).remove([videoUrl]);
  } catch {
    // Best-effort
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
  if (fileExists(rec.localUri)) return rec.localUri!;
  if (!rec.audioUrl) return null;
  const uri = await download(STORAGE_BUCKET, rec.audioUrl, rec.id);
  if (uri) await saveRecording({ ...rec, localUri: uri });
  return uri;
}

/** Ensure a video is on this device. Returns a local URI or null. */
export async function ensureLocalVideo(videoId: string): Promise<string | null> {
  const clip = await getVideo(videoId);
  if (!clip) return null;
  if (fileExists(clip.localUri)) return clip.localUri!;
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
