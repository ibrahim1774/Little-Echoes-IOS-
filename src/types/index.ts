// ============================================================
// LittleEchoes — TypeScript Interfaces
// Local storage: SQLite. Cloud: Supabase (same row shapes as the web app).
// ============================================================

export type AgeGroup = '1-2' | '3-4' | '5-6' | '7-9' | '10-12';
export type QuestionCategory = 'favorites' | 'challenges' | 'emotions' | 'learning' | 'gratitude';
export type EmotionTag = 'happy' | 'silly' | 'thoughtful' | 'shy' | 'excited' | 'sad';
export type QuestionMode = 'fresh' | 'fixed';
export type SessionStatus = 'in-progress' | 'completed';
export type Tier = 'basic' | 'pro';

export interface ParentSettings {
  reminderTime: string; // HH:MM
  reminderDays: string[]; // ['mon','tue','wed','thu','fri']
  darkMode: boolean;
  questionMode: QuestionMode;
  selectedQuestionIds: string[]; // if fixed mode
}

export interface ParentProfile {
  id: string;
  name: string;
  email?: string;
  avatarEmoji: string;
  createdAt: string; // ISO timestamp
  settings: ParentSettings;
}

export interface ChildProfile {
  id: string;
  parentId: string;
  name: string;
  birthdate: string; // YYYY-MM-DD
  ageGroup: AgeGroup;
  avatarEmoji: string;
  schoolName?: string;
  createdAt: string;
}

export interface Question {
  id: string;
  text: string;
  category: QuestionCategory;
  ageGroups: AgeGroup[];
  isCustom: boolean;
  createdBy?: string; // parentId if custom
}

export interface RecordingSession {
  id: string;
  childId: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  status: SessionStatus;
}

export interface Recording {
  id: string;
  sessionId: string;
  childId: string;
  questionId: string;
  questionText: string; // snapshot at recording time
  localUri?: string; // file on this device, when present
  audioUrl?: string; // Supabase Storage path once uploaded
  mimeType?: string; // 'audio/mp4' on iOS; web may be webm/wav
  durationSeconds: number;
  transcription?: string;
  emotionTag?: EmotionTag;
  parentNote?: string;
  createdAt: string;
}

export interface VideoClip {
  id: string;
  childId: string;
  date: string; // YYYY-MM-DD (one per day)
  localUri?: string;
  videoUrl?: string; // Supabase Storage path
  mimeType?: string;
  durationSeconds: number;
  caption?: string;
  createdAt: string;
}

export interface Streak {
  childId: string;
  currentStreak: number;
  longestStreak: number;
  lastRecordingDate: string; // YYYY-MM-DD
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface TodayProgress {
  sessionId: string;
  questionIndex: number;
  recordings: Recording[];
  flow: 'questions' | 'free';
}

export interface AppState {
  parent: ParentProfile | null;
  children: ChildProfile[];
  activeChild: ChildProfile | null;
  isOnboarded: boolean;
  darkMode: boolean;
  todayQuestions: Question[];
  todaySession: RecordingSession | null;
  todayProgress: TodayProgress | null;
  streak: Streak | null;
  todayVideoRecorded: boolean;
  isPaid: boolean;
  tier: Tier | null;
  isLoading: boolean;
  user: AuthUser | null;
}

export type AppAction =
  | { type: 'SET_PARENT'; payload: ParentProfile | null }
  | { type: 'SET_CHILDREN'; payload: ChildProfile[] }
  | { type: 'ADD_CHILD'; payload: ChildProfile }
  | { type: 'SET_ACTIVE_CHILD'; payload: ChildProfile | null }
  | { type: 'SET_ONBOARDED'; payload: boolean }
  | { type: 'SET_DARK_MODE'; payload: boolean }
  | { type: 'SET_TODAY_QUESTIONS'; payload: Question[] }
  | { type: 'SET_TODAY_SESSION'; payload: RecordingSession | null }
  | { type: 'SET_STREAK'; payload: Streak | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: AuthUser | null }
  | { type: 'SET_TODAY_PROGRESS'; payload: TodayProgress | null }
  | { type: 'SET_TODAY_VIDEO_RECORDED'; payload: boolean }
  | { type: 'SET_SUBSCRIPTION'; payload: { isPaid: boolean; tier: Tier | null } }
  | { type: 'RESET' };
