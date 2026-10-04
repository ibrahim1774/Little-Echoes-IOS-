import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path } from 'react-native-svg';

import { isPlayableOnIOS } from '@/lib/logic';
import { colors } from '@/lib/theme';
import { ensureLocalVideo } from '@/services/cloudSync';
import type { VideoClip } from '@/types';

import { NOT_PLAYABLE } from './helpers';
import { claimPlayback, releasePlayback, type PlaybackOwner } from './playback';

const FRAME = 'w-full rounded-2xl items-center justify-center';

function LoadedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });

  useEffect(() => {
    const owner: PlaybackOwner = { stop: () => player.pause() };
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) claimPlayback(owner);
    });
    return () => {
      sub.remove();
      releasePlayback(owner);
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: 'black' }}
    />
  );
}

export function VideoPlayer({ clip }: { clip: VideoClip }) {
  const mountedRef = useRef(true);
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!isPlayableOnIOS(clip.mimeType, clip.videoUrl)) {
    return (
      <View className={`${FRAME} bg-echo-light-gray dark:bg-echo-dark-bg px-4`} style={{ aspectRatio: 16 / 9 }}>
        <Text className="font-inter text-xs text-echo-gray text-center">{NOT_PLAYABLE}</Text>
      </View>
    );
  }

  // The player is only created once the user asks for it
  async function handleOpen() {
    setError(false);
    setLoading(true);
    const local = await ensureLocalVideo(clip.id);
    if (local) await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    if (!mountedRef.current) return;
    setLoading(false);
    if (!local) {
      setError(true);
      return;
    }
    setUri(local);
  }

  if (uri) return <LoadedVideo uri={uri} />;

  if (loading) {
    return (
      <View className={`${FRAME} bg-echo-light-gray dark:bg-echo-dark-bg`} style={{ aspectRatio: 16 / 9 }}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  return (
    <Pressable
      testID={`video-play-${clip.id}`}
      accessibilityRole="button"
      accessibilityLabel="Play video"
      onPress={() => void handleOpen()}
      className={`${FRAME} bg-black active:opacity-80 gap-2`}
      style={{ aspectRatio: 16 / 9 }}
    >
      <View className="w-14 h-14 rounded-full bg-white/20 items-center justify-center">
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="white">
          <Path d="M8 5v14l11-7z" />
        </Svg>
      </View>
      {error && <Text className="font-inter text-xs text-white/80">Video not available</Text>}
    </Pressable>
  );
}
