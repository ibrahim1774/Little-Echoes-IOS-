import {
  audioContentType,
  audioExt,
  calcAgeGroup,
  daysBetween,
  formatDuration,
  isAdmin,
  isFreeRecording,
  isPlayableOnIOS,
  nextStreak,
  parseJson,
  pickQuestions,
  recordingToRow,
  resolveTier,
  rowToRecording,
  rowToVideo,
  toDateStr,
  videoExt,
  videoToRow,
} from '@/lib/logic';
import { STARTER_QUESTIONS } from '@/data/questions';
import type { AgeGroup, Recording, VideoClip } from '@/types';

describe('dates', () => {
  it('formats the local calendar date, not the UTC one', () => {
    // 11:30pm local on Jan 5 must stay Jan 5 whatever the UTC offset is.
    expect(toDateStr(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(toDateStr(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });

  it('counts whole days across month, year and DST boundaries', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // US DST starts Mar 8
    expect(daysBetween('2026-05-01', '2026-05-01')).toBe(0);
    expect(daysBetween('2026-05-02', '2026-05-01')).toBe(-1);
  });
});

describe('calcAgeGroup', () => {
  const now = new Date(2026, 9, 4); // 4 Oct 2026
  const cases: [string, AgeGroup][] = [
    ['2026-09-01', '1-2'], // newborn
    ['2024-01-15', '1-2'], // 2
    ['2023-10-01', '3-4'], // just turned 3
    ['2022-01-01', '3-4'], // 4
    ['2020-06-01', '5-6'], // 6
    ['2019-06-01', '7-9'], // 7
    ['2017-01-01', '7-9'], // 9
    ['2016-01-01', '10-12'], // 10
    ['2010-01-01', '10-12'], // older than the top band still gets it
  ];
  it.each(cases)('birthdate %s → %s', (birthdate, expected) => {
    expect(calcAgeGroup(birthdate, now)).toBe(expected);
  });
});

describe('nextStreak', () => {
  it('starts at 1 on the first recording', () => {
    expect(nextStreak(undefined, 'c1', '2026-10-04')).toEqual({
      childId: 'c1',
      currentStreak: 1,
      longestStreak: 1,
      lastRecordingDate: '2026-10-04',
    });
  });

  const base = { childId: 'c1', currentStreak: 3, longestStreak: 5, lastRecordingDate: '2026-10-03' };

  it('does not double count a second recording on the same day', () => {
    expect(nextStreak({ ...base, lastRecordingDate: '2026-10-04' }, 'c1', '2026-10-04').currentStreak).toBe(3);
  });

  it('extends on consecutive days and keeps the longest', () => {
    const s = nextStreak(base, 'c1', '2026-10-04');
    expect(s.currentStreak).toBe(4);
    expect(s.longestStreak).toBe(5);
  });

  it('raises the longest streak when passed', () => {
    const s = nextStreak({ ...base, currentStreak: 5 }, 'c1', '2026-10-04');
    expect(s).toMatchObject({ currentStreak: 6, longestStreak: 6 });
  });

  it('resets after a missed day', () => {
    const s = nextStreak(base, 'c1', '2026-10-06');
    expect(s).toMatchObject({ currentStreak: 1, longestStreak: 5, lastRecordingDate: '2026-10-06' });
  });

  it('resets rather than going negative if the clock moved backwards', () => {
    expect(nextStreak(base, 'c1', '2026-10-01').currentStreak).toBe(1);
  });
});

describe('pickQuestions', () => {
  const groups: AgeGroup[] = ['3-4', '5-6', '7-9', '10-12'];

  it.each(groups)('returns 3 distinct age-appropriate questions for %s', (ageGroup) => {
    for (let i = 0; i < 25; i++) {
      const picked = pickQuestions(STARTER_QUESTIONS, { ageGroup }, new Set());
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((q) => q.id)).size).toBe(3);
      for (const q of picked) expect(q.ageGroups).toContain(ageGroup);
    }
  });

  it('avoids recently asked questions when enough remain', () => {
    const pool = STARTER_QUESTIONS.filter((q) => q.ageGroups.includes('5-6'));
    const recent = new Set(pool.slice(0, pool.length - 5).map((q) => q.id));
    for (let i = 0; i < 25; i++) {
      for (const q of pickQuestions(STARTER_QUESTIONS, { ageGroup: '5-6' }, recent)) {
        expect(recent.has(q.id)).toBe(false);
      }
    }
  });

  it('falls back to the full pool when almost everything was asked recently', () => {
    const pool = STARTER_QUESTIONS.filter((q) => q.ageGroups.includes('5-6'));
    const recent = new Set(pool.slice(0, pool.length - 1).map((q) => q.id));
    expect(pickQuestions(STARTER_QUESTIONS, { ageGroup: '5-6' }, recent)).toHaveLength(3);
  });

  it('returns what exists when fewer than 3 questions match', () => {
    const two = STARTER_QUESTIONS.filter((q) => q.ageGroups.includes('7-9')).slice(0, 2);
    expect(pickQuestions(two, { ageGroup: '7-9' }, new Set())).toHaveLength(2);
    expect(pickQuestions([], { ageGroup: '7-9' }, new Set())).toEqual([]);
  });

  it('is deterministic for a given random source', () => {
    const seq = () => {
      let i = 0;
      return () => ((i++ * 7919) % 100) / 100;
    };
    const a = pickQuestions(STARTER_QUESTIONS, { ageGroup: '7-9' }, new Set(), seq());
    const b = pickQuestions(STARTER_QUESTIONS, { ageGroup: '7-9' }, new Set(), seq());
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });
});

describe('resolveTier', () => {
  it('is unpaid with no entitlements', () => {
    expect(resolveTier([], 'a@b.com')).toEqual({ isPaid: false, tier: null });
    expect(resolveTier([], null)).toEqual({ isPaid: false, tier: null });
  });
  it('maps basic and pro', () => {
    expect(resolveTier(['basic'], 'a@b.com')).toEqual({ isPaid: true, tier: 'basic' });
    expect(resolveTier(['pro'], 'a@b.com')).toEqual({ isPaid: true, tier: 'pro' });
  });
  it('prefers pro when both are active (mid-upgrade)', () => {
    expect(resolveTier(['basic', 'pro'], 'a@b.com').tier).toBe('pro');
  });
  it('ignores unknown entitlements', () => {
    expect(resolveTier(['gold'], 'a@b.com')).toEqual({ isPaid: false, tier: null });
  });
  it('gives the admin email Pro regardless of case', () => {
    expect(resolveTier([], 'Ibrahim3709@Gmail.com')).toEqual({ isPaid: true, tier: 'pro' });
    expect(isAdmin('ibrahim3709@gmail.com.evil.com')).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe('media helpers', () => {
  it('maps mime types to the extensions the web app uses', () => {
    expect(audioExt('audio/mp4')).toBe('mp4');
    expect(audioExt('audio/wav')).toBe('wav');
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExt(undefined)).toBe('webm');
    expect(audioContentType('audio/mp4')).toBe('audio/mp4');
    expect(videoExt('video/mp4')).toBe('mp4');
    expect(videoExt('video/quicktime')).toBe('mp4');
    expect(videoExt('video/webm')).toBe('webm');
  });

  it('flags WebM and Ogg as unplayable on iOS', () => {
    expect(isPlayableOnIOS('audio/webm;codecs=opus', 'u/1.webm')).toBe(false);
    expect(isPlayableOnIOS(undefined, 'u/1.webm')).toBe(false);
    expect(isPlayableOnIOS('audio/ogg')).toBe(false);
    expect(isPlayableOnIOS('audio/mp4', 'u/1.mp4')).toBe(true);
    expect(isPlayableOnIOS('audio/wav', 'u/1.wav')).toBe(true);
    expect(isPlayableOnIOS()).toBe(true);
  });

  it('recognises free-form recordings in every historical form', () => {
    expect(isFreeRecording({ questionId: 'free-123', questionText: 'x' })).toBe(true);
    expect(isFreeRecording({ questionId: 'q', questionText: 'Custom audio' })).toBe(true);
    expect(isFreeRecording({ questionId: 'q', questionText: 'Free recording' })).toBe(true);
    expect(isFreeRecording({ questionId: 'fav-01', questionText: 'What was fun?' })).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
  });
});

describe('cloud row mapping', () => {
  const rec: Recording = {
    id: 'r1',
    sessionId: 's1',
    childId: 'c1',
    questionId: 'fav-01',
    questionText: 'What was fun?',
    localUri: 'file:///device/media/r1.mp4',
    mimeType: 'audio/mp4',
    durationSeconds: 12,
    parentNote: 'sweet',
    createdAt: '2026-10-04T10:00:00.000Z',
  };

  it('writes the same row shape as the web app and never the device path', () => {
    const row = recordingToRow(rec, 'u1', 'u1/r1.mp4');
    expect(row).toMatchObject({ id: 'r1', user_id: 'u1', created_at: rec.createdAt });
    const data = JSON.parse(row.data);
    expect(data).toEqual({
      sessionId: 's1',
      childId: 'c1',
      questionId: 'fav-01',
      questionText: 'What was fun?',
      durationSeconds: 12,
      mimeType: 'audio/mp4',
      parentNote: 'sweet',
      createdAt: rec.createdAt,
      audioUrl: 'u1/r1.mp4',
    });
    expect(row.data).not.toContain('file://');
  });

  it('round-trips a recording through a row', () => {
    const back = rowToRecording(recordingToRow(rec, 'u1', 'u1/r1.mp4'));
    expect(back).toEqual({ ...rec, localUri: undefined, audioUrl: 'u1/r1.mp4' });
  });

  it('reads rows whether jsonb arrives as a string or an object', () => {
    const asObject = rowToRecording({ id: 'r2', data: { childId: 'c1', questionId: 'q', questionText: 't', sessionId: 's', durationSeconds: 1, createdAt: 'x' } });
    expect(asObject?.id).toBe('r2');
  });

  it('drops a device path that leaked into a cloud row', () => {
    const leaked = rowToRecording({ id: 'r3', data: JSON.stringify({ childId: 'c1', localUri: 'file:///other/phone.mp4' }) });
    expect(leaked?.localUri).toBeUndefined();
  });

  it('returns null for corrupt or empty rows instead of throwing', () => {
    expect(rowToRecording({ id: 'x', data: '{not json' })).toBeNull();
    expect(rowToRecording({ id: 'x', data: null })).toBeNull();
    expect(rowToRecording({ id: 'x', data: '{}' })).toBeNull();
    expect(rowToVideo({ id: 'x', data: 'null' })).toBeNull();
    expect(parseJson('')).toBeNull();
  });

  it('round-trips a video', () => {
    const clip: VideoClip = {
      id: 'v1',
      childId: 'c1',
      date: '2026-10-04',
      localUri: 'file:///device/v1.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 15,
      caption: 'first steps',
      createdAt: '2026-10-04T10:00:00.000Z',
    };
    const row = videoToRow(clip, 'u1', 'u1/v1.mp4');
    expect(row.data).not.toContain('file://');
    expect(rowToVideo(row)).toEqual({ ...clip, localUri: undefined, videoUrl: 'u1/v1.mp4' });
  });
});

describe('recording integrity', () => {
  const { mdatBytes, isCompleteRecording } = jest.requireActual('@/lib/logic') as typeof import('@/lib/logic');
  const box = (type: string, payload: number) => {
    const b = new Uint8Array(8 + payload);
    new DataView(b.buffer).setUint32(0, 8 + payload);
    for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    return b;
  };
  const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };

  it('finds the payload after ftyp, moov and a large free box (the stalled-capture file)', () => {
    const file = concat(box('ftyp', 20), box('moov', 569), box('free', 56723), box('mdat', 36));
    expect(mdatBytes(file)).toBe(36);
    expect(isCompleteRecording(mdatBytes(file), 18)).toBe(false);
  });

  it('accepts a normal take', () => {
    const file = concat(box('ftyp', 20), box('moov', 569), box('mdat', 19 * 15000));
    expect(isCompleteRecording(mdatBytes(file), 19)).toBe(true);
  });

  it('rejects files without a payload or with a corrupt box size', () => {
    expect(mdatBytes(concat(box('ftyp', 20), box('moov', 10)))).toBeNull();
    expect(mdatBytes(new Uint8Array([0, 0, 0, 2, 102, 116, 121, 112]))).toBeNull();
    expect(isCompleteRecording(null, 3)).toBe(false);
  });
});

describe('streakFromDates', () => {
  const { streakFromDates, pickQuestions: pick } = jest.requireActual('@/lib/logic') as typeof import('@/lib/logic');
  it('returns nothing without sessions', () => {
    expect(streakFromDates('c', [], '2026-10-04')).toBeUndefined();
  });
  it('counts a run ending today and remembers the longest run', () => {
    const s = streakFromDates('c', ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-03', '2026-10-04', '2026-10-04'], '2026-10-04');
    expect(s).toEqual({ childId: 'c', currentStreak: 2, longestStreak: 4, lastRecordingDate: '2026-10-04' });
  });
  it('keeps a streak that ended yesterday alive and zeroes an older one', () => {
    expect(streakFromDates('c', ['2026-10-02', '2026-10-03'], '2026-10-04')?.currentStreak).toBe(2);
    expect(streakFromDates('c', ['2026-10-01', '2026-10-02'], '2026-10-04')?.currentStreak).toBe(0);
  });
  it('keeps other parents\' custom questions out of the pool', () => {
    const mine = { id: 'm', text: 'mine', category: 'favorites' as const, ageGroups: ['5-6' as const], isCustom: true, createdBy: 'p1' };
    const theirs = { ...mine, id: 't', text: 'theirs', createdBy: 'p2' };
    const picked = pick([mine, theirs], { ageGroup: '5-6', parentId: 'p1' }, new Set());
    expect(picked.map((q) => q.id)).toEqual(['m']);
  });
});
