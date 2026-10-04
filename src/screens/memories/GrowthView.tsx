import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { isPlayableOnIOS } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import { ensureLocalAudio } from '@/services/cloudSync';

import { AudioPlayer } from './AudioPlayer';
import { DurationPill, EmptyNote } from './CardParts';
import {
  buildGrowthMontage,
  recordingSubtitle,
  recordingTitle,
  type GroupedSession,
  type GrowthRange,
  type MediaType,
  type MontageEntry,
} from './helpers';
import { claimPlayback, releasePlayback, type PlaybackOwner } from './playback';

export interface GrowthSettings {
  range: GrowthRange;
  interval: number;
  shuffleSeed: number;
}

interface GrowthViewProps {
  header: ReactElement;
  groups: GroupedSession[];
  mediaType: MediaType;
  childId: string;
  settings: GrowthSettings;
  onChangeSettings: (next: GrowthSettings) => void;
}

const RANGES: { key: GrowthRange; label: string }[] = [
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
  { key: 'all', label: 'All time' },
];

const INTERVALS = [
  { days: 7, label: 'Weekly' },
  { days: 30, label: 'Monthly' },
  { days: 182, label: '6 Months' },
  { days: 365, label: 'Yearly' },
];

/** Plays the montage one recording after another, skipping anything that can't be played here. */
function usePlayAll(montage: MontageEntry[]) {
  const [index, setIndex] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const runRef = useRef(0);
  const finishRef = useRef<(() => void) | null>(null);
  const ownerRef = useRef<PlaybackOwner>({ stop: () => undefined });

  const stop = useCallback(() => {
    runRef.current += 1;
    finishRef.current?.();
    releasePlayback(ownerRef.current);
    setIndex(null);
    setActiveId(null);
  }, []);

  useEffect(() => {
    ownerRef.current.stop = stop;
    return stop;
  }, [stop]);

  function playOne(uri: string): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const player = createAudioPlayer(uri, { updateInterval: 250 });
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        finishRef.current = null;
        try {
          player.pause();
          player.remove();
        } catch {
          // already released
        }
        resolve();
      };
      // A file that never loads shouldn't stall the sequence
      const timer = setTimeout(() => {
        if (!player.isLoaded) finish();
      }, 8000);
      finishRef.current = finish;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) finish();
      });
      player.play();
    });
  }

  async function start() {
    const run = ++runRef.current;
    claimPlayback(ownerRef.current);
    setIndex(0);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);

    for (let i = 0; i < montage.length; i++) {
      if (runRef.current !== run) return;
      const { rec } = montage[i];
      if (!isPlayableOnIOS(rec.mimeType, rec.audioUrl)) continue;
      setIndex(i);
      setActiveId(rec.id);
      const uri = await ensureLocalAudio(rec.id);
      if (runRef.current !== run) return;
      if (!uri) continue;
      await playOne(uri);
    }
    if (runRef.current === run) stop();
  }

  return { index, activeId, start: () => void start(), stop };
}

export function GrowthView({ header, groups, mediaType, childId, settings, onChangeSettings }: GrowthViewProps) {
  const listRef = useRef<FlatList<MontageEntry>>(null);

  const montage = useMemo(
    () => buildGrowthMontage(groups, settings.range, settings.interval, childId, settings.shuffleSeed),
    [groups, settings.range, settings.interval, childId, settings.shuffleSeed]
  );

  const playAll = usePlayAll(montage);
  const isPlayingAll = playAll.index !== null;
  const videoOnly = mediaType === 'video';

  useEffect(() => {
    if (playAll.index === null) return;
    listRef.current?.scrollToIndex({ index: playAll.index, viewPosition: 0.3, animated: true });
  }, [playAll.index]);

  function change(patch: Partial<GrowthSettings>) {
    playAll.stop();
    onChangeSettings({ ...settings, ...patch });
  }

  const renderItem = useCallback(
    ({ item }: { item: MontageEntry }) => {
      const { rec, windowStart, windowEnd, windowRecCount } = item;
      const isActive = playAll.activeId === rec.id;
      const dateLabel = new Date(rec.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const windowLabel = `${windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      return (
        <View className="px-4">
          <View className="pl-10 pb-3">
            {/* Connecting line */}
            <View className="absolute top-0 bottom-0 w-0.5 bg-echo-light-gray dark:bg-white/10" style={{ left: 16 }} />
            {/* Timeline dot */}
            <View
              className={`absolute top-4 w-3 h-3 rounded-full border-2 ${
                isActive
                  ? 'bg-echo-coral border-echo-coral'
                  : 'bg-white dark:bg-echo-dark-card border-echo-light-gray dark:border-white/20'
              }`}
              style={{ left: 10, transform: [{ scale: isActive ? 1.25 : 1 }] }}
            />

            <View
              testID={`growth-card-${rec.id}`}
              className={`bg-white dark:bg-echo-dark-card rounded-2xl p-4 border-2 ${
                isActive ? 'border-echo-coral' : 'border-transparent'
              }`}
              style={shadows.soft}
            >
              {/* Window range label */}
              <Text className="font-inter-semibold text-[10px] text-echo-coral uppercase tracking-wider mb-1">
                {windowLabel} · {windowRecCount} recording{windowRecCount !== 1 ? 's' : ''} in window
              </Text>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-inter text-xs text-echo-gray">{dateLabel}</Text>
                <DurationPill seconds={rec.durationSeconds} />
              </View>
              <Text className="font-nunito-semibold text-sm text-echo-charcoal dark:text-white leading-snug">
                {recordingTitle(rec)}
              </Text>
              <Text className="font-inter text-xs text-echo-gray mb-2">{recordingSubtitle(rec)}</Text>
              <AudioPlayer recording={rec} />
            </View>
          </View>
        </View>
      );
    },
    [playAll.activeId]
  );

  const controls = videoOnly ? null : (
    <View className="px-4">
      {/* Time range chips */}
      <View className="mb-3">
        <Text className="font-nunito-bold text-xs text-echo-gray uppercase tracking-wider mb-2">Time Range</Text>
        <View className="flex-row gap-2">
          {RANGES.map((opt) => {
            const active = settings.range === opt.key;
            return (
              <Pressable
                key={opt.key}
                testID={`growth-range-${opt.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => change({ range: opt.key })}
                className={`px-3 py-1.5 rounded-full active:opacity-80 ${active ? 'bg-echo-coral' : 'bg-white dark:bg-echo-dark-card'}`}
                style={active ? undefined : shadows.soft}
              >
                <Text className={`font-nunito-semibold text-xs ${active ? 'text-white' : 'text-echo-gray'}`}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Interval chips */}
      <View className="mb-4">
        <Text className="font-nunito-bold text-xs text-echo-gray uppercase tracking-wider mb-2">Interval</Text>
        <View className="flex-row gap-2">
          {INTERVALS.map((opt) => {
            const active = settings.interval === opt.days;
            return (
              <Pressable
                key={opt.days}
                testID={`growth-interval-${opt.days}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => change({ interval: opt.days })}
                className={`px-3 py-1.5 rounded-full active:opacity-80 ${active ? 'bg-echo-sky' : 'bg-white dark:bg-echo-dark-card'}`}
                style={active ? undefined : shadows.soft}
              >
                <Text className={`font-nunito-semibold text-xs ${active ? 'text-white' : 'text-echo-gray'}`}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Header + Shuffle + Play All */}
      {montage.length > 0 && (
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <Text className="font-nunito-bold text-sm text-echo-charcoal dark:text-white">
              {montage.length} echo{montage.length !== 1 ? 'es' : ''}
            </Text>
            <Pressable
              testID="growth-shuffle"
              accessibilityRole="button"
              accessibilityLabel="Shuffle recordings"
              onPress={() => change({ shuffleSeed: settings.shuffleSeed + 1 })}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-white dark:bg-echo-dark-card active:opacity-80"
              style={shadows.soft}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="16 3 21 3 21 8" />
                <Line x1={4} y1={20} x2={21} y2={3} />
                <Polyline points="21 16 21 21 16 21" />
                <Line x1={15} y1={15} x2={21} y2={21} />
                <Line x1={4} y1={4} x2={9} y2={9} />
              </Svg>
              <Text className="font-nunito-semibold text-xs text-echo-gray">Shuffle</Text>
            </Pressable>
          </View>
          <Pressable
            testID="growth-play-all"
            accessibilityRole="button"
            onPress={isPlayingAll ? playAll.stop : playAll.start}
            className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full active:opacity-80 ${
              isPlayingAll ? 'bg-echo-charcoal' : 'bg-echo-coral'
            }`}
            style={isPlayingAll ? undefined : shadows.coral}
          >
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="white">
              <Path d={isPlayingAll ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z'} />
            </Svg>
            <Text className="font-nunito-bold text-xs text-white">
              {isPlayingAll ? `Stop (${(playAll.index ?? 0) + 1}/${montage.length})` : 'Play All'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      ref={listRef}
      testID="memories-growth"
      data={videoOnly ? [] : montage}
      keyExtractor={(entry) => entry.rec.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <>
          {header}
          {controls}
        </>
      }
      ListEmptyComponent={
        videoOnly ? (
          <EmptyNote
            emoji="🎬"
            text="Growth view shows audio recordings over time. Switch to Timeline or Calendar to view videos."
            className="py-12 gap-3 px-8"
          />
        ) : (
          <EmptyNote emoji="🌱" text="No echoes in this time range yet. Keep recording!" className="py-12 gap-3 px-8" />
        )
      }
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: true });
      }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    />
  );
}
