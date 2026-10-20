import { createMemoryStore, setStore } from '@/services/db';
import * as storage from '@/services/storage';
import type { AuthUser, ChildProfile, ParentProfile, Recording } from '@/types';

jest.mock('expo-sqlite', () => ({}));

// ── A fake Supabase: in-memory tables and buckets, with switchable failures ──
// Failure keys: 'upsert:<table>', 'select:<table>', 'delete:<table>', 'upload:<bucket>', 'remove:<bucket>'.
const mockCloud = {
  tables: {} as Record<string, Map<string, Record<string, unknown>>>,
  buckets: {} as Record<string, Set<string>>,
  fail: new Set<string>(),
  reset() {
    this.tables = { profiles: new Map(), recordings: new Map(), sessions: new Map(), videos: new Map() };
    this.buckets = { recordings: new Set(), videos: new Set() };
    this.fail = new Set();
  },
};

jest.mock('@/services/supabase', () => {
  const err = (key: string) => (mockCloud.fail.has(key) ? { message: `${key} failed` } : null);
  const keyOf = (table: string, row: Record<string, unknown>) => String(row.id);
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const rows = () =>
      [...mockCloud.tables[table].values()].filter((r) => filters.every(([k, v]) => r[k] === v));
    const query = {
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return query;
      },
      maybeSingle: async () => (err(`select:${table}`) ? { data: null, error: err(`select:${table}`) } : { data: rows()[0] ?? null, error: null }),
      then(resolve: (v: unknown) => void) {
        resolve(err(`select:${table}`) ? { data: null, error: err(`select:${table}`) } : { data: rows(), error: null });
      },
    };
    const deletion = {
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return deletion;
      },
      then(resolve: (v: unknown) => void) {
        const e = err(`delete:${table}`);
        if (!e) for (const r of rows()) mockCloud.tables[table].delete(String(r.id));
        resolve({ error: e });
      },
    };
    return {
      upsert: async (input: Record<string, unknown> | Record<string, unknown>[]) => {
        const e = err(`upsert:${table}`);
        if (!e)
          for (const row of Array.isArray(input) ? input : [input]) {
            const prev = mockCloud.tables[table].get(keyOf(table, row)) ?? {};
            mockCloud.tables[table].set(keyOf(table, row), { ...prev, ...row });
          }
        return { error: e };
      },
      select: () => query,
      delete: () => deletion,
    };
  };
  const storageFrom = (bucket: string) => ({
    upload: async (path: string) => {
      const e = err(`upload:${bucket}`);
      if (!e) mockCloud.buckets[bucket].add(path);
      return { error: e };
    },
    remove: async (paths: string[]) => {
      const e = err(`remove:${bucket}`);
      if (!e) for (const p of paths) mockCloud.buckets[bucket].delete(p);
      return { error: e };
    },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
  });
  return {
    supabase: {
      from,
      storage: { from: storageFrom },
      auth: { signOut: jest.fn(async () => ({ error: null })) },
      functions: { invoke: jest.fn() },
    },
  };
});

// ── Files on "this device" ──
const mockFiles = new Set<string>();
jest.mock('@/services/files', () => ({
  fileExists: (uri?: string) => !!uri && mockFiles.has(uri),
  readBytes: async () => new ArrayBuffer(8),
  resolveMediaUri: (uri: string) => uri,
  deleteFile: (uri?: string) => {
    if (uri) mockFiles.delete(uri);
  },
  downloadTo: async (_url: string, id: string, ext: string) => {
    const uri = `file:///media/${id}.${ext}`;
    mockFiles.add(uri);
    return uri;
  },
  deleteAllMedia: () => mockFiles.clear(),
  persistMedia: (_t: string, id: string, ext: string) => `file:///media/${id}.${ext}`,
}));
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { configure: jest.fn(), signOut: jest.fn() } }));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-crypto', () => ({}));
jest.mock('@/services/notifications', () => ({ cancelReminders: jest.fn(async () => {}) }));
jest.mock('@/services/analytics', () => ({ resetAnalytics: jest.fn() }));

// Imported after the mocks.
import { loadFromCloud, removeRecording, syncToCloud } from '@/services/cloudSync';
import { countUnsynced, signOut } from '@/services/auth';

const user: AuthUser = { id: 'u1', email: 'qa@example.com' };
const parent: ParentProfile = {
  id: 'p1',
  name: 'Sam',
  avatarEmoji: '👩',
  createdAt: '2026-01-01T00:00:00.000Z',
  settings: { reminderTime: '19:00', reminderDays: ['mon'], darkMode: false, questionMode: 'fresh', selectedQuestionIds: [] },
};
const child = (id: string, name: string): ChildProfile => ({
  id,
  parentId: 'p1',
  name,
  birthdate: '2021-05-01',
  ageGroup: '5-6',
  avatarEmoji: '🦄',
  createdAt: '2026-01-02T00:00:00.000Z',
});
const rec = (id: string, over: Partial<Recording> = {}): Recording => ({
  id,
  sessionId: 's1',
  childId: 'c1',
  questionId: 'fav-01',
  questionText: 'q',
  durationSeconds: 3,
  mimeType: 'audio/mp4',
  createdAt: '2026-10-01T12:00:00.000Z',
  ...over,
});
/** A recording made on this device, with its audio file present. */
async function recordLocally(id: string) {
  const r = rec(id, { localUri: `file:///media/${id}.m4a` });
  mockFiles.add(r.localUri!);
  await storage.saveRecording(r);
  return r;
}

beforeEach(async () => {
  setStore(createMemoryStore());
  mockCloud.reset();
  mockFiles.clear();
  await storage.saveParent(parent);
  await storage.saveChild(child('c1', 'Mia'));
});

describe('a sync that stops halfway', () => {
  it('keeps a recording whose audio uploaded but whose row never reached the cloud', async () => {
    await recordLocally('r1');
    mockCloud.fail.add('upsert:recordings');
    await syncToCloud(user);
    expect(mockCloud.buckets.recordings.has('u1/r1.mp4')).toBe(true);
    expect(mockCloud.tables.recordings.has('r1')).toBe(false);

    await loadFromCloud(user);
    expect(await storage.getRecording('r1')).toBeDefined();

    // The next sync finishes the job.
    mockCloud.fail.clear();
    await syncToCloud(user);
    expect(mockCloud.tables.recordings.has('r1')).toBe(true);
  });

  it('keeps a recording saved by an older build (uploaded audio, never marked synced) that has no cloud row', async () => {
    await storage.saveRecording(rec('legacy', { audioUrl: 'u1/legacy.m4a', localUri: 'file:///media/legacy.m4a' }));
    mockFiles.add('file:///media/legacy.m4a');
    await loadFromCloud(user);
    expect(await storage.getRecording('legacy')).toBeDefined();
  });

  it('still removes a recording that was deleted on another device', async () => {
    await recordLocally('r2');
    await syncToCloud(user);
    expect(mockCloud.tables.recordings.has('r2')).toBe(true);
    mockCloud.tables.recordings.delete('r2'); // deleted elsewhere
    await loadFromCloud(user);
    expect(await storage.getRecording('r2')).toBeUndefined();
  });
});

describe('deleting', () => {
  it("doesn't bring back a memory whose cloud delete failed, and finishes the delete on the next sync", async () => {
    const r = await recordLocally('r3');
    await syncToCloud(user);
    mockCloud.fail.add('delete:recordings');
    mockCloud.fail.add('remove:recordings');
    await removeRecording(user, r.id);
    expect(await storage.getRecording('r3')).toBeUndefined();

    await loadFromCloud(user);
    expect(await storage.getRecording('r3')).toBeUndefined();

    mockCloud.fail.clear();
    await syncToCloud(user);
    expect(mockCloud.tables.recordings.has('r3')).toBe(false);
    expect(mockCloud.buckets.recordings.has('u1/r3.mp4')).toBe(false);
  });
});

describe('signing out', () => {
  it("won't wipe recordings that haven't reached the cloud", async () => {
    await recordLocally('r4');
    mockCloud.fail.add('upload:recordings');
    const result = await signOut(user);
    expect(result.unsynced).toBe(1);
    expect(await storage.getRecording('r4')).toBeDefined();
  });

  it('signs out when everything is backed up', async () => {
    await recordLocally('r5');
    const result = await signOut(user);
    expect(result.unsynced).toBe(0);
    expect(await storage.getRecording('r5')).toBeUndefined();
  });

  it('counts a row that never reached the cloud as not backed up', async () => {
    await recordLocally('r6');
    mockCloud.fail.add('upsert:recordings');
    await syncToCloud(user);
    expect(await countUnsynced()).toBe(1);
  });
});

describe('the family profile', () => {
  it('reports when the profile could not be read', async () => {
    mockCloud.fail.add('select:profiles');
    expect((await loadFromCloud(user)).profileLoaded).toBe(false);
  });

  it("never replaces the cloud's children with a smaller list", async () => {
    mockCloud.tables.profiles.set('u1', {
      id: 'u1',
      parent: JSON.stringify(parent),
      children: JSON.stringify([child('c1', 'Mia'), child('c2', 'Leo')]),
    });
    // This device only knows about Mia.
    await syncToCloud(user);
    const saved = JSON.parse(String(mockCloud.tables.profiles.get('u1')!.children)) as ChildProfile[];
    expect(saved.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it("doesn't write the profile when it couldn't read it first", async () => {
    mockCloud.tables.profiles.set('u1', { id: 'u1', parent: 'cloud', children: 'cloud' });
    mockCloud.fail.add('select:profiles');
    await syncToCloud(user);
    expect(mockCloud.tables.profiles.get('u1')!.children).toBe('cloud');
  });
});
