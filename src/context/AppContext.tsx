import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { colorScheme } from 'nativewind';

import { loadFromCloud } from '@/services/cloudSync';
import { ensureSeeded } from '@/services/db';
import { scheduleReminders } from '@/services/notifications';
import { getChildren, getParent, getStreak, getTodaySession, getTodayVideo } from '@/services/storage';
import { supabase } from '@/services/supabase';
import { identifyUser } from '@/services/analytics';
import type { AppAction, AppState, AuthUser } from '@/types';

const initialState: AppState = {
  parent: null,
  children: [],
  activeChild: null,
  isOnboarded: false,
  darkMode: false,
  todayQuestions: [],
  todaySession: null,
  todayProgress: null,
  todayVideoRecorded: false,
  isPaid: false,
  tier: null,
  streak: null,
  isLoading: true,
  user: null,
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PARENT':
      return { ...state, parent: action.payload };
    case 'SET_CHILDREN':
      return { ...state, children: action.payload };
    case 'ADD_CHILD':
      return { ...state, children: [...state.children, action.payload], activeChild: action.payload };
    case 'SET_ACTIVE_CHILD':
      return { ...state, activeChild: action.payload };
    case 'SET_ONBOARDED':
      return { ...state, isOnboarded: action.payload };
    case 'SET_DARK_MODE':
      return { ...state, darkMode: action.payload };
    case 'SET_TODAY_QUESTIONS':
      return { ...state, todayQuestions: action.payload };
    case 'SET_TODAY_SESSION':
      return { ...state, todaySession: action.payload };
    case 'SET_STREAK':
      return { ...state, streak: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_TODAY_PROGRESS':
      return { ...state, todayProgress: action.payload };
    case 'SET_TODAY_VIDEO_RECORDED':
      return { ...state, todayVideoRecorded: action.payload };
    case 'SET_SUBSCRIPTION':
      return { ...state, isPaid: action.payload.isPaid, tier: action.payload.tier };
    case 'RESET':
      // Subscription belongs to the device's Apple ID, not the account, so it survives.
      return { ...initialState, isLoading: false, isPaid: state.isPaid, tier: state.tier };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  /** Re-read parent, children and today's status from the local store. */
  reloadLocal: () => Promise<void>;
  /** Pull the user's data from the cloud, then reload local state. */
  hydrateUser: (user: AuthUser) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeChildId = useRef<string | null>(null);
  activeChildId.current = state.activeChild?.id ?? null;

  const reloadLocal = useCallback(async () => {
    const parent = await getParent();
    if (!parent) {
      dispatch({ type: 'SET_PARENT', payload: null });
      dispatch({ type: 'SET_CHILDREN', payload: [] });
      dispatch({ type: 'SET_ACTIVE_CHILD', payload: null });
      dispatch({ type: 'SET_ONBOARDED', payload: false });
      return;
    }
    dispatch({ type: 'SET_PARENT', payload: parent });
    dispatch({ type: 'SET_ONBOARDED', payload: true });

    const darkMode = !!parent.settings?.darkMode;
    colorScheme.set(darkMode ? 'dark' : 'light');
    dispatch({ type: 'SET_DARK_MODE', payload: darkMode });

    const kids = await getChildren(parent.id);
    dispatch({ type: 'SET_CHILDREN', payload: kids });

    const active = kids.find((k) => k.id === activeChildId.current) ?? kids[0] ?? null;
    dispatch({ type: 'SET_ACTIVE_CHILD', payload: active });
    if (active) {
      const [streak, session, video] = await Promise.all([
        getStreak(active.id),
        getTodaySession(active.id),
        getTodayVideo(active.id),
      ]);
      dispatch({ type: 'SET_STREAK', payload: streak ?? null });
      dispatch({ type: 'SET_TODAY_SESSION', payload: session ?? null });
      dispatch({ type: 'SET_TODAY_VIDEO_RECORDED', payload: !!video });
      if (parent.settings) {
        void scheduleReminders(parent.settings, { skipToday: session?.status === 'completed' }).catch(() => {});
      }
    }
  }, []);

  const hydrateUser = useCallback(
    async (user: AuthUser) => {
      dispatch({ type: 'SET_USER', payload: user });
      identifyUser(user.id);
      await loadFromCloud(user);
      await reloadLocal();
    },
    [reloadLocal]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await ensureSeeded();
        colorScheme.set('light');
        // Local data first so the app opens instantly and works offline.
        await reloadLocal();
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user && !cancelled) {
            const user = { id: data.session.user.id, email: data.session.user.email ?? '' };
            dispatch({ type: 'SET_USER', payload: user });
            identifyUser(user.id);
            // Cloud refresh happens in the background; it must not block launch.
            void loadFromCloud(user).then(() => (cancelled ? undefined : reloadLocal()));
          }
        } catch {
          // Auth check failed (expired token, offline) — continue with local data.
        }
      } finally {
        if (!cancelled) dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') dispatch({ type: 'RESET' });
      else if (session?.user) {
        dispatch({ type: 'SET_USER', payload: { id: session.user.id, email: session.user.email ?? '' } });
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [reloadLocal]);

  return (
    <AppContext.Provider value={{ state, dispatch, reloadLocal, hydrateUser }}>{children}</AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
