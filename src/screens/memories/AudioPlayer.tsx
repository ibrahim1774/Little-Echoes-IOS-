import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer as ExpoAudioPlayer } from 'expo-audio';
import Svg, { Path } from 'react-native-svg';

import { formatDuration, isPlayableOnIOS } from '@/lib/logic';
import { ensureLocalAudio } from '@/services/cloudSync';
import type { Recording } from '@/types';

import { LOAD_ERROR, NOT_PLAYABLE } from './helpers';
import { claimPlayback, releasePlayback, type PlaybackOwner } from './playback';

export function AudioPlayer({ recording }: { recording: Recording }) {
  const playerRef = useRef<ExpoAudioPlayer | null>(null);
  const mountedRef = useRef(true);
  const barWidthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(recording.durationSeconds ?? 0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const ownerRef = useRef<PlaybackOwner>({
    stop: () => {
      playerRef.current?.pause();
      setIsPlaying(false);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    const owner = ownerRef.current;
    return () => {
      mountedRef.current = false;
      releasePlayback(owner);
      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        try {
          player.pause();
          player.remove();
        } catch {
          // already released
        }
      }
    };
  }, []);

  if (!isPlayableOnIOS(recording.mimeType, recording.audioUrl)) {
    return <Text className="font-inter text-xs text-echo-gray mt-2">{NOT_PLAYABLE}</Text>;
  }

  function setupAudio(uri: string): ExpoAudioPlayer {
    const player = createAudioPlayer(uri, { updateInterval: 200 });
    playerRef.current = player;
    player.addListener('playbackStatusUpdate', (status) => {
      if (!mountedRef.current || playerRef.current !== player) return;
      if (status.duration && isFinite(status.duration) && status.duration > 0) setDuration(status.duration);
      if (status.didJustFinish) {
        player.pause();
        void player.seekTo(0);
        releasePlayback(ownerRef.current);
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        return;
      }
      if (status.duration > 0) setProgress(Math.min(1, status.currentTime / status.duration));
      setCurrentTime(status.currentTime);
    });
    setReady(true);
    return player;
  }

  function start(player: ExpoAudioPlayer) {
    claimPlayback(ownerRef.current);
    player.play();
    setIsPlaying(true);
  }

  // Resolves the file on first tap, downloading from the cloud if it isn't on this device
  async function handlePlay() {
    if (loadingAudio) return;

    if (isPlaying) {
      playerRef.current?.pause();
      releasePlayback(ownerRef.current);
      setIsPlaying(false);
      return;
    }

    if (playerRef.current) {
      start(playerRef.current);
      return;
    }

    setAudioError(false);
    setLoadingAudio(true);
    const uri = await ensureLocalAudio(recording.id);
    if (!mountedRef.current) return;
    setLoadingAudio(false);

    if (!uri) {
      setAudioError(true);
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!mountedRef.current) return;
      start(setupAudio(uri));
    } catch {
      setAudioError(true);
    }
  }

  function handleProgressPress(e: GestureResponderEvent) {
    const player = playerRef.current;
    if (!player || !duration || !barWidthRef.current) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
    void player.seekTo(ratio * duration);
    setProgress(ratio);
    setCurrentTime(ratio * duration);
  }

  return (
    <View className="mt-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          testID={`audio-play-${recording.id}`}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : loadingAudio ? 'Loading' : 'Play'}
          onPress={() => void handlePlay()}
          hitSlop={6}
          className="w-9 h-9 rounded-full bg-echo-sky items-center justify-center active:opacity-80"
        >
          {loadingAudio ? (
            <ActivityIndicator size="small" color="white" />
          ) : isPlaying ? (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="white">
              <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </Svg>
          ) : (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="white">
              <Path d="M8 5v14l11-7z" />
            </Svg>
          )}
        </Pressable>
        <Pressable
          testID={`audio-seek-${recording.id}`}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          onPress={handleProgressPress}
          onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
          className="flex-1 py-3"
        >
          <View pointerEvents="none" className="h-2 bg-echo-light-gray rounded-full overflow-hidden">
            <View className="h-full bg-echo-coral rounded-full" style={{ width: `${progress * 100}%` }} />
          </View>
        </Pressable>
        <Text className="font-inter text-xs text-echo-gray text-right">
          {ready
            ? `${formatDuration(Math.round(currentTime))} / ${formatDuration(Math.round(duration))}`
            : formatDuration(Math.round(duration))}
        </Text>
      </View>
      {audioError && <Text className="font-inter text-xs text-echo-gray">{LOAD_ERROR}</Text>}
    </View>
  );
}
