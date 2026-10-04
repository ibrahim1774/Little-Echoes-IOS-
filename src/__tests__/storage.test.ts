import { createMemoryStore, ensureSeeded, getStore, setStore } from '@/services/db';
import * as storage from '@/services/storage';
import { STARTER_QUESTIONS } from '@/data/questions';
import { toDateStr } from '@/lib/logic';
import type { ChildProfile, ParentProfile, Recording } from '@/types';

jest.mock('expo-sqlite', () => ({}));

const parent: ParentProfile = {
  id: 'p1',
  name: 'Sam',
  avatarEmoji: '👩',
  createdAt: '2026-01-01T00:00:00.000Z',
  settings: { reminderTime: '19:00', reminderDays: ['mon'], darkMode: false, questionMode: 'fresh', selectedQuestionIds: [] },
};
const child: ChildProfile = {
  id: 'c1',
  parentId: 'p1',
  name: 'Mia',
  birthdate: '2021-05-01',
  ageGroup: '5-6',
  avatarEmoji: '🦄',
  createdAt: '2026-01-02T00:00:00.000Z',
};
const rec = (id: string, over: Partial<Recording> = {}): Recording => ({
  id,
  sessionId: 's1',
  childId: 'c1',
  questionId: 'fav-01',
  questionText: 'q',
  durationSeconds: 3,
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => setStore(createMemoryStore()));

describe('seeding', () => {
  it('seeds every starter question once', async () => {
    await ensureSeeded();
    await ensureSeeded();
    expect(await getStore().all('questions')).toHaveLength(STARTER_QUESTIONS.length);
  });
});

describe('profiles', () => {
  it('saves and reads the parent and only that parent\'s children', async () => {
    await storage.saveParent(parent);
    await storage.saveChild(child);
    await storage.saveChild({ ...child, id: 'c2', parentId: 'other' });
    expect(await storage.getParent()).toEqual(parent);
    expect((await storage.getChildren('p1')).map((c) => c.id)).toEqual(['c1']);
  });

  it('returns undefined when there is no parent', async () => {
    expect(await storage.getParent()).toBeUndefined();
  });
});

describe('recordings', () => {
  it('lists a child\'s recordings newest first', async () => {
    await storage.saveRecording(rec('a', { createdAt: '2026-01-01T00:00:00.000Z' }));
    await storage.saveRecording(rec('b', { createdAt: '2026-03-01T00:00:00.000Z' }));
    await storage.saveRecording(rec('z', { childId: 'other' }));
    expect((await storage.getRecordingsByChild('c1')).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('counts only today\'s recordings', async () => {
    await storage.saveRecording(rec('today'));
    await storage.saveRecording(rec('old', { createdAt: '2020-01-01T12:00:00.000Z' }));
    expect(await storage.getTodayRecordingCount('c1')).toBe(1);
  });

  it('deletes a recording', async () => {
    await storage.saveRecording(rec('a'));
    await storage.deleteRecording('a');
    expect(await storage.getRecording('a')).toBeUndefined();
  });
});

describe('sessions and streaks', () => {
  it('finds today\'s session for the child only', async () => {
    await storage.saveSession({ id: 's1', childId: 'c1', date: toDateStr(), createdAt: 'x', status: 'completed' });
    await storage.saveSession({ id: 's2', childId: 'c1', date: '2020-01-01', createdAt: 'x', status: 'completed' });
    expect((await storage.getTodaySession('c1'))?.id).toBe('s1');
    expect(await storage.getTodaySession('nobody')).toBeUndefined();
  });

  it('creates then holds a streak on the same day', async () => {
    expect((await storage.updateStreak('c1')).currentStreak).toBe(1);
    expect((await storage.updateStreak('c1')).currentStreak).toBe(1);
    expect((await storage.getStreak('c1'))?.lastRecordingDate).toBe(toDateStr());
  });
});

describe('getQuestionsForChild', () => {
  it('returns the same three questions all day', async () => {
    const first = await storage.getQuestionsForChild(child);
    const second = await storage.getQuestionsForChild(child);
    expect(first).toHaveLength(3);
    expect(second.map((q) => q.id)).toEqual(first.map((q) => q.id));
  });

  it('recovers when the cached question was deleted', async () => {
    const first = await storage.getQuestionsForChild(child);
    for (const q of first) await storage.deleteQuestion(q.id);
    const second = await storage.getQuestionsForChild(child);
    expect(second).toHaveLength(3);
  });

  it('recovers from a corrupt cache entry', async () => {
    await storage.kvSet(`questions-${child.id}-${toDateStr()}`, '{broken');
    expect(await storage.getQuestionsForChild(child)).toHaveLength(3);
  });
});

describe('custom questions and reset', () => {
  it('keeps starter questions but removes custom ones and family data on reset', async () => {
    await ensureSeeded();
    await storage.saveParent(parent);
    await storage.saveChild(child);
    await storage.saveRecording(rec('a'));
    await storage.saveVideo({ id: 'v', childId: 'c1', date: toDateStr(), durationSeconds: 1, createdAt: 'x' });
    await storage.saveCustomQuestion({ id: 'custom-1', text: 'Mine', category: 'favorites', ageGroups: ['5-6'], isCustom: true, createdBy: 'p1' });
    expect(await storage.getCustomQuestions('p1')).toHaveLength(1);

    await storage.clearAllData();

    expect(await storage.getParent()).toBeUndefined();
    expect(await storage.getAllRecordings()).toEqual([]);
    expect(await storage.getAllVideos()).toEqual([]);
    expect(await storage.getCustomQuestions('p1')).toEqual([]);
    expect(await getStore().all('questions')).toHaveLength(STARTER_QUESTIONS.length);
  });
});

describe('videos', () => {
  it('finds today\'s video per child', async () => {
    await storage.saveVideo({ id: 'v1', childId: 'c1', date: toDateStr(), durationSeconds: 5, createdAt: 'x' });
    expect((await storage.getTodayVideo('c1'))?.id).toBe('v1');
    expect(await storage.getTodayVideo('c2')).toBeUndefined();
  });
});
