import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

export type RecordingState = 'idle' | 'recording' | 'stopped';

export const AUDIO_MIME_TYPE = 'audio/mp4';

/**
 * Audio recording with the same shape as the web hook: state, elapsed seconds,
 * start/stop/reset, and an auto-stop at `maxSeconds`. The result is a temp
 * file URI (`audioUri`) that the caller moves into permanent storage.
 */
export function useRecording(maxSeconds = 60) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);
  const stateRef = useRef<RecordingState>('idle');
  stateRef.current = recordingState;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stopRecording = useCallback(async () => {
    if (stateRef.current !== 'recording' || busy.current) return;
    busy.current = true;
    clearTimer();
    const elapsed = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) {
        setError('The recording could not be saved. Please try again.');
        setRecordingState('idle');
        return;
      }
      setDurationSeconds(Math.max(1, Math.round(elapsed)));
      setAudioUri(uri);
      setRecordingState('stopped');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop the recording.');
      setRecordingState('idle');
    } finally {
      busy.current = false;
    }
  }, [recorder]);

  const startRecording = useCallback(async () => {
    if (stateRef.current === 'recording' || busy.current) return;
    busy.current = true;
    setError(null);
    setAudioUri(null);
    setElapsedSeconds(0);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        setError('Microphone access is off. Turn it on in Settings to record.');
        return;
      }
      setPermissionDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setRecordingState('recording');
      timer.current = setInterval(() => {
        if (!startedAt.current) return;
        setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start recording.');
      setRecordingState('idle');
    } finally {
      busy.current = false;
    }
  }, [recorder]);

  // Auto-stop at the limit.
  useEffect(() => {
    if (recordingState === 'recording' && elapsedSeconds >= maxSeconds) void stopRecording();
  }, [recordingState, elapsedSeconds, maxSeconds, stopRecording]);

  const resetRecording = useCallback(() => {
    clearTimer();
    startedAt.current = null;
    setAudioUri(null);
    setElapsedSeconds(0);
    setDurationSeconds(0);
    setError(null);
    setRecordingState('idle');
  }, []);

  // Stop the mic if the screen goes away mid-recording.
  useEffect(() => {
    return () => {
      clearTimer();
      if (stateRef.current === 'recording') {
        recorder.stop().catch(() => {});
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      }
    };
  }, [recorder]);

  return {
    recordingState,
    elapsedSeconds,
    maxSeconds,
    audioUri,
    durationSeconds,
    mimeType: AUDIO_MIME_TYPE,
    /** Input level in dB (about -160 to 0) while recording, for the waveform. */
    metering: recorderState.metering ?? null,
    error,
    permissionDenied,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
