import { useEffect, useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { shadows } from '@/lib/theme';

/** A step label shown over the recording while it plays `from`–`to` seconds. */
export interface Callout {
  from: number;
  to: number;
  text: string;
  /** Where the bubble sits, as a fraction of the clip's height (0 = top). */
  top: number;
  /** Which side the arrow points from. */
  side?: 'left' | 'right';
}

interface Props {
  video: number; // require('…mp4')
  poster: ImageSourcePropType;
  aspectRatio: number; // width / height
  width: number;
  callouts?: Callout[];
  testID?: string;
}

/**
 * A screen recording of the app in a phone frame: muted, looping, with numbered callouts
 * timed to the recording. Falls back to a still if the video can't play.
 */
export function DemoClip({ video, poster, aspectRatio, width, callouts = [], testID }: Props) {
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const player = useVideoPlayer(video, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });

  useEffect(() => {
    const onTime = player.addListener('timeUpdate', ({ currentTime }) => setTime(currentTime));
    const onStatus = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setFailed(true);
    });
    return () => {
      onTime.remove();
      onStatus.remove();
    };
  }, [player]);

  const height = width / aspectRatio;
  const radius = Math.round(width * 0.09);
  const active = callouts.filter((c) => time >= c.from && time < c.to);

  return (
    <View testID={testID} style={[shadows.soft, { width, height, borderRadius: radius }]} className="bg-white">
      <View className="border-[3px] border-echo-charcoal/90 overflow-hidden bg-white" style={{ borderRadius: radius, flex: 1 }}>
        {failed ? (
          <Image source={poster} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <VideoView
            player={player}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        )}
      </View>
      {!failed &&
        active.map((c) => (
          <Animated.View
            key={`${c.from}-${c.text}`}
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(200)}
            pointerEvents="none"
            className={`absolute flex-row items-center ${c.side === 'right' ? 'flex-row-reverse' : ''}`}
            style={{ top: c.top * height, [c.side === 'right' ? 'right' : 'left']: -14, maxWidth: width * 0.9 }}
          >
            <View className="bg-echo-coral rounded-full px-3 py-1.5" style={shadows.coral}>
              <Text className="font-nunito-extrabold text-xs text-white">{c.text}</Text>
            </View>
            <Text className="text-echo-coral text-lg font-nunito-extrabold mx-0.5">{c.side === 'right' ? '◀' : '▶'}</Text>
          </Animated.View>
        ))}
    </View>
  );
}
