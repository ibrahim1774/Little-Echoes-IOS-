import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { formatDuration, isPlayableOnIOS, toDateStr } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import { track } from '@/services/analytics';
import { deleteVideoFromCloud, ensureLocalVideo, syncToCloud } from '@/services/cloudSync';
import { deleteFile, persistMedia } from '@/services/files';
import { deleteVideo, getTodayVideo, getVideosByChild, saveVideo } from '@/services/storage';
import type { VideoClip } from '@/types';

const MAX_SECONDS = 15;
const CAMERA_READY_TIMEOUT_MS = 6000;
const CAMERA_UNAVAILABLE = "The camera isn't available on this device.";

function ClipPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <View className="w-full aspect-video rounded-2xl overflow-hidden bg-black">
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

/** A saved clip. Downloads from the cloud when the file isn't on this device. */
function SavedClipPlayer({ clip, autoLoad = false }: { clip: VideoClip; autoLoad?: boolean }) {
  const [requested, setRequested] = useState(autoLoad);
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    async function init() {
      if (!isPlayableOnIOS(clip.mimeType, clip.videoUrl)) {
        setError("This clip was recorded in a format that can't play on iPhone");
        return;
      }
      setLoading(true);
      const local = await ensureLocalVideo(clip.id).catch(() => null);
      if (cancelled) return;
      setLoading(false);
      if (local) setUri(local);
      else setError('Video not available');
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [requested, clip.id, clip.mimeType, clip.videoUrl]);

  if (uri) return <ClipPlayer uri={uri} />;

  if (!requested) {
    return (
      <Pressable
        testID={`video-play-${clip.id}`}
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() => setRequested(true)}
        className="aspect-video bg-black rounded-2xl items-center justify-center active:opacity-80"
      >
        <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="white">
            <Path d="M8 5v14l11-7z" />
          </Svg>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="aspect-video bg-echo-light-gray dark:bg-echo-dark-card rounded-2xl items-center justify-center px-4">
      {loading || !error ? (
        <ActivityIndicator color={colors.coral} />
      ) : (
        <Text className="font-inter text-xs text-echo-gray text-center">{error}</Text>
      )}
    </View>
  );
}

export function VideoScreen() {
  const { state, dispatch } = useApp();
  const { activeChild } = state;
  const isFocused = useIsFocused();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview' | 'saved'>('idle');
  const [todayClip, setTodayClip] = useState<VideoClip | null>(null);
  const [pastClips, setPastClips] = useState<VideoClip[]>([]);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clipUri, setClipUri] = useState<string | null>(null);
  const [clipSeconds, setClipSeconds] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped whenever a recording is abandoned, so its late result is ignored.
  const attemptRef = useRef(0);
  const activeRef = useRef(false);

  const showCamera = isFocused && phase === 'recording' && !recError;

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function abandonRecording() {
    attemptRef.current++;
    activeRef.current = false;
    clearTimer();
    setIsRecording(false);
    setElapsedSeconds(0);
  }

  useEffect(() => {
    return () => {
      attemptRef.current++;
      clearTimer();
    };
  }, []);

  // Load today's clip and past clips
  useEffect(() => {
    if (!activeChild || !isFocused) return;
    const child = activeChild;
    let cancelled = false;
    async function load() {
      const today = await getTodayVideo(child.id);
      const all = await getVideosByChild(child.id);
      if (cancelled) return;
      setTodayClip(today ?? null);
      dispatch({ type: 'SET_TODAY_VIDEO_RECORDED', payload: !!today });
      setPastClips(all.filter((v) => v.id !== today?.id));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeChild, phase, isFocused, dispatch]);

  // Leaving the tab releases the camera, so an in-progress recording is dropped.
  useEffect(() => {
    if (!isFocused && phase === 'recording') {
      abandonRecording();
      setRecError(null);
      setPhase('idle');
    }
  }, [isFocused, phase]);

  // The simulator has no camera and never reports ready.
  useEffect(() => {
    if (!showCamera) return;
    const timeout = setTimeout(() => {
      if (!activeRef.current) setRecError(CAMERA_UNAVAILABLE);
    }, CAMERA_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [showCamera, facing]);

  async function handleStart() {
    setRecError(null);
    try {
      const camera = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      const mic = micPermission?.granted ? micPermission : await requestMicPermission();
      if (!camera.granted || !mic.granted) {
        setPermissionDenied(true);
        return;
      }
    } catch {
      setRecError(CAMERA_UNAVAILABLE);
      return;
    }
    setPermissionDenied(false);
    setFacing('back');
    setElapsedSeconds(0);
    setPhase('recording');
  }

  // Recording starts as soon as the camera is ready, like the web.
  async function beginRecording() {
    const camera = cameraRef.current;
    if (!camera || activeRef.current) return;
    activeRef.current = true;
    const attempt = ++attemptRef.current;
    const startedAt = Date.now();

    clearTimer();
    setElapsedSeconds(0);
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => Math.min(MAX_SECONDS, s + 1));
    }, 1000);

    try {
      // H.264 so clips also play in browsers.
      const result = await camera.recordAsync({ maxDuration: MAX_SECONDS, codec: 'avc1' });
      if (attempt !== attemptRef.current) {
        deleteFile(result?.uri);
        return;
      }
      activeRef.current = false;
      clearTimer();
      setIsRecording(false);
      if (!result?.uri) {
        setRecError('Could not start video recording. Please try again.');
        return;
      }
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      setClipSeconds(Math.min(MAX_SECONDS, Math.max(1, seconds)));
      setClipUri(result.uri);
      setPhase('preview');
    } catch (err) {
      if (attempt !== attemptRef.current) return;
      console.warn('[VideoRecord] Failed:', err);
      activeRef.current = false;
      clearTimer();
      setIsRecording(false);
      setRecError('Could not start video recording. Please try again.');
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  // Switching cameras ends the recording on iOS, so the clip starts over.
  function flipCamera() {
    abandonRecording();
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }

  function discardClip() {
    deleteFile(clipUri ?? undefined);
    setClipUri(null);
    setClipSeconds(0);
    setElapsedSeconds(0);
  }

  async function handleSave() {
    if (!clipUri || !activeChild || saving) return;
    setSaving(true);

    try {
      // Save locally first — instant, works offline. The upload happens in the
      // background via syncToCloud, which retries on the next sync if it fails.
      const id = Crypto.randomUUID();
      const localUri = persistMedia(clipUri, id, 'mp4');
      const clip: VideoClip = {
        id,
        childId: activeChild.id,
        date: toDateStr(),
        localUri,
        mimeType: 'video/mp4',
        durationSeconds: clipSeconds,
        caption: caption.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      await saveVideo(clip);

      dispatch({ type: 'SET_TODAY_VIDEO_RECORDED', payload: true });
      setCaption('');
      setClipUri(null);
      setPhase('saved');
      track('video_saved');

      if (state.user) void syncToCloud(state.user);
    } catch (err) {
      console.error('[VideoSave] Local save failed:', err);
      Alert.alert(
        "Couldn't save the video",
        'Your device may be out of storage — try freeing up space and recording again.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClip(clip: VideoClip) {
    Alert.alert('Delete this video?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setPastClips((prev) => prev.filter((v) => v.id !== clip.id));
          if (todayClip?.id === clip.id) {
            setTodayClip(null);
            dispatch({ type: 'SET_TODAY_VIDEO_RECORDED', payload: false });
          }
          deleteFile(clip.localUri);
          void deleteVideo(clip.id);
          if (state.user) void deleteVideoFromCloud(state.user, clip.id, clip.videoUrl);
        },
      },
    ]);
  }

  if (!activeChild) {
    return (
      <Screen edges={['top']} scroll={false} className="items-center justify-center pb-6">
        <Text className="text-echo-gray font-nunito">No child selected.</Text>
      </Screen>
    );
  }

  const remaining = MAX_SECONDS - elapsedSeconds;

  return (
    <Screen edges={['top']} className="pb-6">
      {/* Header */}
      <View className="px-4 pt-6 pb-3">
        <Text className="font-nunito-extrabold text-2xl text-echo-charcoal dark:text-white">📹 Video</Text>
        <Text className="font-inter text-echo-gray text-sm mt-0.5">{activeChild.name}'s daily clip</Text>
      </View>

      {/* ── RECORDING PHASE ── */}
      {phase === 'recording' && (
        <View className="px-4">
          <View className="aspect-video rounded-2xl overflow-hidden bg-black mb-4">
            {showCamera && (
              <CameraView
                key={facing}
                ref={cameraRef}
                mode="video"
                facing={facing}
                style={{ flex: 1 }}
                onCameraReady={() => void beginRecording()}
                onMountError={() => setRecError(CAMERA_UNAVAILABLE)}
              />
            )}
            {showCamera && (
              <>
                {/* Countdown overlay */}
                <View className="absolute top-3 right-3 bg-black/60 px-3 py-1 rounded-full">
                  <Text
                    testID="video-countdown"
                    className={`font-nunito-bold text-sm ${remaining <= 5 ? 'text-echo-coral' : 'text-white'}`}
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {remaining}s
                  </Text>
                </View>
                <Pressable
                  testID="video-flip-camera"
                  accessibilityRole="button"
                  accessibilityLabel="Flip camera"
                  onPress={flipCamera}
                  className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/60 items-center justify-center active:opacity-80"
                >
                  <Svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Polyline points="23 4 23 10 17 10" />
                    <Polyline points="1 20 1 14 7 14" />
                    <Path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </Svg>
                </Pressable>
                <View className="absolute left-0 right-0 bottom-0 h-1 bg-white/20">
                  <View className="h-1 bg-echo-coral" style={{ width: `${(elapsedSeconds / MAX_SECONDS) * 100}%` }} />
                </View>
              </>
            )}
          </View>

          {recError ? (
            <Pressable
              testID="video-record-back"
              accessibilityRole="button"
              onPress={() => {
                abandonRecording();
                setRecError(null);
                setPhase('idle');
              }}
              className="w-full bg-echo-light-gray dark:bg-echo-dark-card py-4 rounded-full items-center active:opacity-80"
            >
              <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white">Back to Videos</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="video-stop"
              accessibilityRole="button"
              onPress={stopRecording}
              disabled={!isRecording}
              className={`w-full bg-echo-coral py-4 rounded-full flex-row items-center justify-center gap-2 active:opacity-80 ${isRecording ? '' : 'opacity-50'}`}
              style={shadows.coral}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="white">
                <Rect x={6} y={6} width={12} height={12} rx={2} />
              </Svg>
              <Text className="font-nunito-bold text-base text-white">Stop Recording</Text>
            </Pressable>
          )}

          {recError && (
            <Text testID="video-record-error" className="text-echo-coral text-sm font-nunito mt-3 text-center">
              {recError}
            </Text>
          )}
        </View>
      )}

      {/* ── PREVIEW PHASE ── */}
      {phase === 'preview' && clipUri && (
        <View className="px-4">
          <View className="mb-4">
            <ClipPlayer uri={clipUri} />
          </View>

          <TextInput
            testID="video-caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption (optional)"
            placeholderTextColor={colors.gray}
            maxLength={100}
            returnKeyType="done"
            className="w-full bg-white dark:bg-echo-dark-card rounded-xl px-4 py-3 font-inter text-sm text-echo-charcoal dark:text-white border border-echo-light-gray dark:border-white/10 mb-4"
          />

          <View className="flex-row gap-3">
            <Pressable
              testID="video-retake"
              accessibilityRole="button"
              onPress={() => {
                discardClip();
                setPhase('idle');
              }}
              disabled={saving}
              className="flex-1 bg-echo-light-gray dark:bg-echo-dark-card py-3 rounded-full items-center active:opacity-80"
            >
              <Text className="font-nunito-bold text-sm text-echo-charcoal dark:text-white">Re-record</Text>
            </Pressable>
            <Pressable
              testID="video-save"
              accessibilityRole="button"
              onPress={() => void handleSave()}
              disabled={saving}
              className={`flex-1 bg-echo-coral py-3 rounded-full items-center active:opacity-80 ${saving ? 'opacity-50' : ''}`}
              style={shadows.coral}
            >
              <Text className="font-nunito-bold text-sm text-white">{saving ? 'Saving...' : 'Save Clip'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── SAVED CONFIRMATION ── */}
      {phase === 'saved' && (
        <View className="px-4 items-center gap-4 py-8">
          <Text className="text-5xl">🎬</Text>
          <Text className="font-nunito-bold text-xl text-echo-charcoal dark:text-white">Clip saved!</Text>
          <Text className="font-inter text-sm text-echo-gray text-center">
            {activeChild.name}'s moment is safely stored.
          </Text>
          <Pressable
            testID="video-saved-back"
            accessibilityRole="button"
            onPress={() => setPhase('idle')}
            className="bg-echo-coral px-8 py-3 rounded-full active:opacity-80"
            style={shadows.coral}
          >
            <Text className="font-nunito-bold text-sm text-white">Back to Videos</Text>
          </Pressable>
        </View>
      )}

      {/* ── IDLE PHASE ── */}
      {phase === 'idle' && (
        <View className="px-4">
          {/* Today's clip or record button */}
          {todayClip ? (
            <View
              testID="video-today-clip"
              className="bg-white dark:bg-echo-dark-card rounded-2xl p-4 mb-4"
              style={shadows.soft}
            >
              <View className="flex-row items-center gap-2 mb-3">
                <Text className="text-lg">✅</Text>
                <Text className="font-nunito-bold text-sm text-echo-charcoal dark:text-white">Today's clip captured!</Text>
              </View>
              <SavedClipPlayer key={todayClip.id} clip={todayClip} autoLoad />
              {todayClip.caption && (
                <Text className="font-inter text-xs text-echo-gray mt-2">📝 {todayClip.caption}</Text>
              )}
            </View>
          ) : (
            <View className="bg-white dark:bg-echo-dark-card rounded-2xl p-6 mb-4 items-center" style={shadows.soft}>
              <Text className="text-4xl mb-3">📹</Text>
              <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white mb-1 text-center">
                Capture today's moment
              </Text>
              <Text className="font-inter text-sm text-echo-gray mb-4 text-center">
                One 15-second clip of {activeChild.name} — what they're doing right now.
              </Text>
              <Pressable
                testID="video-start"
                accessibilityRole="button"
                onPress={() => void handleStart()}
                className="w-full bg-echo-coral py-4 rounded-full flex-row items-center justify-center gap-2 active:opacity-80"
                style={shadows.coral}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="white">
                  <Path d="M23 7l-7 5 7 5V7z" />
                  <Rect x={1} y={5} width={15} height={14} rx={2} ry={2} />
                </Svg>
                <Text className="font-nunito-bold text-base text-white">Start Recording</Text>
              </Pressable>

              {permissionDenied && (
                <View className="mt-4 items-center gap-2">
                  <Text testID="video-permission-denied" className="text-echo-coral text-sm font-nunito text-center">
                    Camera and microphone access are off for Little Echoes. Turn them on in Settings to record video.
                  </Text>
                  <Pressable
                    testID="video-open-settings"
                    accessibilityRole="button"
                    onPress={() => void Linking.openSettings()}
                    className="px-4 py-2 rounded-full border-2 border-echo-coral active:opacity-80"
                  >
                    <Text className="font-nunito-bold text-sm text-echo-coral">Open Settings</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Past clips */}
          {pastClips.length > 0 && (
            <View>
              <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white mb-3">Past Clips</Text>
              <View className="gap-3">
                {pastClips.map((clip) => {
                  const dateLabel = new Date(clip.createdAt).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <View key={clip.id} className="bg-white dark:bg-echo-dark-card rounded-2xl p-4" style={shadows.soft}>
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm">{activeChild.avatarEmoji}</Text>
                          <Text className="font-inter text-xs text-echo-gray">{dateLabel}</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <View className="bg-echo-sky/15 px-2 py-0.5 rounded-full">
                            <Text className="font-inter text-xs text-echo-sky">{formatDuration(clip.durationSeconds)}</Text>
                          </View>
                          <Pressable
                            testID={`video-delete-${clip.id}`}
                            accessibilityRole="button"
                            accessibilityLabel="Delete video"
                            hitSlop={10}
                            onPress={() => handleDeleteClip(clip)}
                            className="active:opacity-80"
                          >
                            <Svg
                              width={14}
                              height={14}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={colors.gray}
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <Polyline points="3 6 5 6 21 6" />
                              <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </Svg>
                          </Pressable>
                        </View>
                      </View>
                      <SavedClipPlayer clip={clip} />
                      {clip.caption && <Text className="font-inter text-xs text-echo-gray mt-2">📝 {clip.caption}</Text>}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
