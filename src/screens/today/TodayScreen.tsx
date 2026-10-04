import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { toDateStr } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { syncToCloud } from '@/services/cloudSync';
import { deleteFile, persistMedia } from '@/services/files';
import { scheduleReminders } from '@/services/notifications';
import { saveRecording, saveSession, updateStreak } from '@/services/storage';
import type { Recording, RecordingSession } from '@/types';
import { GradientBackground } from './GradientBackground';
import { QuestionDisplay } from './QuestionDisplay';
import { RecordingView } from './RecordingView';
import { ReviewRecording } from './ReviewRecording';
import { SessionComplete } from './SessionComplete';

type SessionPhase =
  | { step: 'hub' }
  | { step: 'question'; questionIndex: number }
  | { step: 'recording'; questionIndex: number }
  | { step: 'review'; questionIndex: number; uri: string; duration: number; mimeType: string }
  | { step: 'free-recording' }
  | { step: 'free-review'; uri: string; duration: number; mimeType: string }
  | { step: 'complete'; recordings: Recording[] };

function generateId() {
  return Crypto.randomUUID();
}

export function TodayScreen() {
  const { state, dispatch } = useApp();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  // The tab stays mounted for the life of the app, so the session id is tied to a date.
  const session = useRef({ id: state.todayProgress?.sessionId ?? generateId(), date: toDateStr() });
  const [phase, setPhase] = useState<SessionPhase>(() => {
    if (!state.todayProgress) return { step: 'hub' };
    if (state.todayProgress.flow === 'free') return { step: 'free-recording' };
    return { step: 'question', questionIndex: state.todayProgress.questionIndex };
  });
  const [collectedRecordings, setCollectedRecordings] = useState<Recording[]>(
    () => state.todayProgress?.recordings ?? []
  );
  const [focused, setFocused] = useState(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const { activeChild, todayQuestions, parent } = state;

  // Leaving the tab stops any recording; coming back resumes from todayProgress,
  // as a remount does on the web.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        const current = phaseRef.current;
        if (current.step === 'recording') {
          setPhase({ step: 'question', questionIndex: current.questionIndex });
        } else if (current.step === 'complete') {
          session.current = { id: generateId(), date: toDateStr() };
          setCollectedRecordings([]);
          setPhase({ step: 'hub' });
        }
      };
    }, [])
  );

  if (!activeChild || !parent) {
    return (
      <Screen edges={['top']} className="items-center justify-center px-6 pb-6">
        <Text className="font-nunito text-echo-gray text-center">No child selected. Please go back home.</Text>
        <Pressable
          onPress={() => router.navigate('/home')}
          accessibilityRole="button"
          testID="today-back-home"
          className="mt-4 bg-echo-coral px-8 py-3 rounded-full active:opacity-80"
          style={shadows.coral}
        >
          <Text className="font-nunito-bold text-white text-base">Back Home</Text>
        </Pressable>
      </Screen>
    );
  }

  const child = activeChild;
  const parentSettings = parent.settings;

  const currentQuestion =
    phase.step === 'question' || phase.step === 'recording' || phase.step === 'review'
      ? todayQuestions[phase.questionIndex]
      : null;

  /** Recordings carried into a new flow; a new day starts a new session. */
  function beginFlow(): Recording[] {
    if (session.current.date === toDateStr()) return collectedRecordings;
    session.current = { id: generateId(), date: toDateStr() };
    setCollectedRecordings([]);
    return [];
  }

  function goBackToHub() {
    if (phase.step === 'review' || phase.step === 'free-review') deleteFile(phase.uri);
    dispatch({ type: 'SET_TODAY_PROGRESS', payload: null });
    setPhase({ step: 'hub' });
  }

  function startQuestionFlow() {
    const recordings = beginFlow();
    dispatch({
      type: 'SET_TODAY_PROGRESS',
      payload: { sessionId: session.current.id, questionIndex: 0, recordings, flow: 'questions' },
    });
    setPhase({ step: 'question', questionIndex: 0 });
  }

  function startFreeRecording() {
    const recordings = beginFlow();
    dispatch({
      type: 'SET_TODAY_PROGRESS',
      payload: { sessionId: session.current.id, questionIndex: 0, recordings, flow: 'free' },
    });
    setPhase({ step: 'free-recording' });
  }

  function handleStartRecording() {
    setPhase((p) => (p.step === 'question' ? { step: 'recording', questionIndex: p.questionIndex } : p));
  }

  function handleRecordingDone(uri: string, duration: number, mimeType: string) {
    if (phase.step === 'recording') {
      setPhase({ step: 'review', questionIndex: phase.questionIndex, uri, duration, mimeType });
    } else if (phase.step === 'free-recording') {
      setPhase({ step: 'free-review', uri, duration, mimeType });
    }
  }

  function handleReRecord() {
    if (phase.step === 'review') {
      deleteFile(phase.uri);
      setPhase({ step: 'recording', questionIndex: phase.questionIndex });
    } else if (phase.step === 'free-review') {
      deleteFile(phase.uri);
      setPhase({ step: 'free-recording' });
    }
  }

  /** Saves on this device, then uploads in the background. Returns null if the save failed. */
  async function saveRecordingEntry(
    tempUri: string,
    duration: number,
    questionId: string,
    questionText: string,
    emotionTag?: Recording['emotionTag'],
    parentNote?: string
  ): Promise<Recording | null> {
    const id = generateId();
    let localUri = tempUri;

    try {
      localUri = persistMedia(tempUri, id, 'm4a');

      const recording: Recording = {
        id,
        sessionId: session.current.id,
        childId: child.id,
        questionId,
        questionText,
        localUri,
        mimeType: 'audio/mp4',
        durationSeconds: duration,
        emotionTag,
        parentNote,
        createdAt: new Date().toISOString(),
      };

      // Ensure session exists
      const inProgress: RecordingSession = {
        id: session.current.id,
        childId: child.id,
        date: toDateStr(),
        createdAt: new Date().toISOString(),
        status: 'in-progress',
      };
      await saveSession(inProgress);
      dispatch({ type: 'SET_TODAY_SESSION', payload: inProgress });

      await saveRecording(recording);

      if (state.user) void syncToCloud(state.user).catch(() => {});
      return recording;
    } catch (err) {
      console.error('Failed to save recording:', err);
      // Keep the audio reachable so the save can be retried from the review step.
      if (localUri !== tempUri) {
        setPhase((p) => (p.step === 'review' || p.step === 'free-review' ? { ...p, uri: localUri } : p));
      }
      Alert.alert('Could not save', 'The recording could not be saved. Please try again.');
      return null;
    }
  }

  async function completeSession(recordingCount: number) {
    try {
      const completedSession: RecordingSession = {
        id: session.current.id,
        childId: child.id,
        date: toDateStr(),
        createdAt: new Date().toISOString(),
        status: 'completed',
      };
      await saveSession(completedSession);
      dispatch({ type: 'SET_TODAY_SESSION', payload: completedSession });

      const streak = await updateStreak(child.id);
      dispatch({ type: 'SET_STREAK', payload: streak });
    } catch (err) {
      console.error('Failed to complete session:', err);
    }

    void scheduleReminders(parentSettings, { skipToday: true }).catch(() => {});
    track('session_completed', { recordings: recordingCount });
    if (state.user) void syncToCloud(state.user).catch(() => {});
  }

  async function handleQuestionNext(
    uri: string,
    duration: number,
    emotionTag?: Recording['emotionTag'],
    parentNote?: string
  ) {
    if (phase.step !== 'review') return;

    const { questionIndex } = phase;
    const question = todayQuestions[questionIndex];
    if (!question) return;

    const recording = await saveRecordingEntry(uri, duration, question.id, question.text, emotionTag, parentNote);
    if (!recording) return;

    const newRecordings = [...collectedRecordings, recording];
    setCollectedRecordings(newRecordings);

    const nextIndex = questionIndex + 1;
    const isLast = questionIndex >= todayQuestions.length - 1;

    if (isLast) {
      await completeSession(newRecordings.length);
      dispatch({ type: 'SET_TODAY_PROGRESS', payload: null });
      setPhase({ step: 'complete', recordings: newRecordings });
    } else {
      dispatch({
        type: 'SET_TODAY_PROGRESS',
        payload: { sessionId: session.current.id, questionIndex: nextIndex, recordings: newRecordings, flow: 'questions' },
      });
      setPhase({ step: 'question', questionIndex: nextIndex });
    }
  }

  async function handleFreeNext(
    uri: string,
    duration: number,
    emotionTag?: Recording['emotionTag'],
    parentNote?: string
  ) {
    if (phase.step !== 'free-review') return;

    const recording = await saveRecordingEntry(
      uri, duration, `free-${generateId()}`, 'Custom audio', emotionTag, parentNote
    );
    if (!recording) return;

    const newRecordings = [...collectedRecordings, recording];
    setCollectedRecordings(newRecordings);

    // Mark session complete, update streak, go back to hub
    await completeSession(newRecordings.length);

    dispatch({ type: 'SET_TODAY_PROGRESS', payload: null });
    // Return to hub so they can record more or see they're done
    setPhase({ step: 'hub' });
  }

  // ── Render phases ──────────────────────────────────────────

  if (phase.step === 'complete') {
    return <SessionComplete recordings={phase.recordings} childName={child.name} />;
  }

  const backButton = (
    <Pressable
      onPress={goBackToHub}
      accessibilityRole="button"
      accessibilityLabel="Back to options"
      testID="today-back"
      className="absolute left-4 w-10 h-10 rounded-full bg-white/80 dark:bg-echo-dark-card/80 items-center justify-center active:opacity-80"
      style={[shadows.soft, { top: insets.top + 16 }]}
    >
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colorScheme === 'dark' ? '#FFFFFF' : colors.charcoal}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
    </Pressable>
  );

  if (phase.step === 'question' && currentQuestion) {
    return (
      <View className="flex-1">
        <QuestionDisplay
          question={currentQuestion}
          questionIndex={phase.questionIndex}
          totalQuestions={todayQuestions.length}
          childName={child.name}
          onStartRecording={handleStartRecording}
        />
        {backButton}
      </View>
    );
  }

  if (phase.step === 'recording' && currentQuestion) {
    return (
      <View className="flex-1">
        <RecordingView
          question={currentQuestion}
          questionIndex={phase.questionIndex}
          totalQuestions={todayQuestions.length}
          childName={child.name}
          onDone={handleRecordingDone}
          onCancel={goBackToHub}
        />
        {backButton}
      </View>
    );
  }

  if (phase.step === 'review' && currentQuestion) {
    return (
      <View className="flex-1">
        <ReviewRecording
          question={currentQuestion}
          questionIndex={phase.questionIndex}
          totalQuestions={todayQuestions.length}
          uri={phase.uri}
          duration={phase.duration}
          onReRecord={handleReRecord}
          onNext={handleQuestionNext}
        />
        {backButton}
      </View>
    );
  }

  if (phase.step === 'free-recording') {
    // The mic is released while another tab is showing.
    if (!focused) {
      return (
        <Screen edges={['top']}>
          <GradientBackground />
        </Screen>
      );
    }
    return (
      <View className="flex-1">
        <RecordingView
          questionIndex={0}
          totalQuestions={1}
          childName={child.name}
          onDone={handleRecordingDone}
          onCancel={goBackToHub}
          isFreeRecording
        />
        {backButton}
      </View>
    );
  }

  if (phase.step === 'free-review') {
    return (
      <View className="flex-1">
        <ReviewRecording
          questionIndex={0}
          totalQuestions={1}
          uri={phase.uri}
          duration={phase.duration}
          onReRecord={handleReRecord}
          onNext={handleFreeNext}
          isFreeRecording
        />
        {backButton}
      </View>
    );
  }

  // ── Record Hub (default) ───────────────────────────────────

  const chevron = (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );

  return (
    <Screen edges={['top']} className="px-5 pt-8 pb-6">
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <View className="items-center mb-6">
          <Text className="text-5xl mb-3">{child.avatarEmoji}</Text>
          <Text className="font-nunito-bold text-2xl text-echo-charcoal dark:text-white text-center">
            Record for {child.name}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(150)}>
        <View className="gap-4">
          {/* Answer Questions option — hidden for age 1-2 */}
          {child.ageGroup !== '1-2' && todayQuestions.length > 0 && (
            <Pressable
              onPress={startQuestionFlow}
              accessibilityRole="button"
              testID="today-start-questions"
              className="w-full bg-white dark:bg-echo-dark-card rounded-2xl p-5 active:opacity-80"
              style={shadows.soft}
            >
              <View className="flex-row items-center gap-4">
                <View className="w-14 h-14 rounded-full bg-echo-coral/10 items-center justify-center">
                  <Text className="text-2xl">❓</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white">
                    Answer Today's Questions
                  </Text>
                  <Text className="font-inter text-echo-gray text-xs mt-0.5">
                    {todayQuestions.length} question{todayQuestions.length !== 1 ? 's' : ''} ready for {child.name}
                  </Text>
                </View>
                {chevron}
              </View>
            </Pressable>
          )}

          {/* Free Recording option */}
          <Pressable
            onPress={startFreeRecording}
            accessibilityRole="button"
            testID="today-start-free"
            className="w-full bg-white dark:bg-echo-dark-card rounded-2xl p-5 active:opacity-80"
            style={shadows.soft}
          >
            <View className="flex-row items-center gap-4">
              <View className="w-14 h-14 rounded-full bg-echo-sky/10 items-center justify-center">
                <Text className="text-2xl">🎙️</Text>
              </View>
              <View className="flex-1">
                <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white">
                  Just Record Their Voice
                </Text>
                <Text className="font-inter text-echo-gray text-xs mt-0.5">
                  No questions — capture anything up to 1 minute
                </Text>
              </View>
              {chevron}
            </View>
          </Pressable>
        </View>
      </Animated.View>

      {/* Tip */}
      <Animated.View entering={FadeInDown.duration(400).delay(250)}>
        <View className="mt-6 rounded-xl bg-echo-orange/10 px-4 py-3">
          <Text className="font-nunito text-echo-orange text-xs text-center">
            💡 Each recording is up to 1 minute
          </Text>
        </View>
      </Animated.View>
    </Screen>
  );
}
