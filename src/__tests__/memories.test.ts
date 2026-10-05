import { buildGroups } from '@/screens/memories/helpers';
import type { Recording, RecordingSession } from '@/types';

jest.mock('expo-sharing', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('@/services/cloudSync', () => ({}));

const session = (id: string, date: string): RecordingSession => ({ id, childId: 'c', date, createdAt: `${date}T10:00:00Z`, status: 'completed' });
const rec = (id: string, sessionId: string, createdAt: string) =>
  ({ id, sessionId, childId: 'c', questionId: 'fav-01', questionText: 'q', durationSeconds: 3, createdAt }) as Recording;

describe('buildGroups', () => {
  it('shows each day once even with several sessions, newest first', () => {
    const groups = buildGroups(
      [session('a', '2026-10-04'), session('b', '2026-10-04'), session('c', '2026-10-03'), session('empty', '2026-10-05')],
      [rec('1', 'a', '2026-10-04T09:00:00Z'), rec('2', 'b', '2026-10-04T11:00:00Z'), rec('3', 'c', '2026-10-03T09:00:00Z')]
    );
    expect(groups.map((g) => g.session.date)).toEqual(['2026-10-04', '2026-10-03']);
    expect(groups[0].recordings.map((r) => r.id)).toEqual(['2', '1']);
  });
});
