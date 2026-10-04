import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { EmptyMemoriesIllustration } from '@/components/illustrations/EmptyMemoriesIllustration';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { CATEGORY_COLORS } from '@/data/questions';
import { shadows } from '@/lib/theme';
import { deleteRecordingFromCloud, deleteVideoFromCloud, syncToCloud } from '@/services/cloudSync';
import { deleteFile } from '@/services/files';
import {
  deleteRecording,
  deleteVideo,
  getRecording,
  getRecordingsByChild,
  getSessionsByChild,
  getVideo,
  getVideosByChild,
} from '@/services/storage';
import type { VideoClip } from '@/types';

import { CalendarView, type CalMonth } from './memories/CalendarView';
import { GrowthView, type GrowthSettings } from './memories/GrowthView';
import { buildGroups, CATEGORY_CHIPS, type GroupedSession, type MediaType, type ViewMode } from './memories/helpers';
import { stopCurrentPlayback } from './memories/playback';
import { TimelineView } from './memories/TimelineView';

const VIEW_LABELS: Record<ViewMode, string> = {
  timeline: '📋 Timeline',
  calendar: '📅 Calendar',
  growth: '🌱 Growth',
};

const MEDIA_LABELS: Record<MediaType, string> = {
  all: '✨ All',
  audio: '🎙️ Audio',
  video: '🎬 Video',
};

export function Memories() {
  const { state } = useApp();
  const { activeChild, user } = state;
  const [groups, setGroups] = useState<GroupedSession[]>([]);
  const [videos, setVideos] = useState<VideoClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const loadedChildRef = useRef<string | null>(null);

  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<CalMonth>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [growth, setGrowth] = useState<GrowthSettings>({ range: 'all', interval: 7, shuffleSeed: 0 });

  const childId = activeChild?.id;

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      let cancelled = false;

      async function read(id: string) {
        const [sessions, recordings, childVideos] = await Promise.all([
          getSessionsByChild(id),
          getRecordingsByChild(id),
          getVideosByChild(id),
        ]);
        if (cancelled) return;
        setGroups(buildGroups(sessions, recordings));
        setVideos(childVideos);
      }

      async function load(id: string) {
        if (loadedChildRef.current !== id) setLoading(true);
        await read(id);
        if (cancelled) return;
        loadedChildRef.current = id;
        setLoading(false);

        // Upload anything that only exists on this device, then pick up the new cloud paths
        if (user) {
          await syncToCloud(user);
          if (!cancelled) await read(id);
        }
      }

      load(childId).catch((err: unknown) => {
        console.warn('[Memories] load failed', err);
        if (!cancelled) setLoading(false);
      });

      return () => {
        cancelled = true;
        stopCurrentPlayback();
      };
    }, [childId, user])
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteRecording = useCallback(
    (recId: string) => {
      setGroups((prev) =>
        prev
          .map((g) => ({ ...g, recordings: g.recordings.filter((r) => r.id !== recId) }))
          .filter((g) => g.recordings.length > 0)
      );
      void (async () => {
        // The stored row knows about files downloaded after this list was loaded
        const rec = await getRecording(recId);
        deleteFile(rec?.localUri);
        await deleteRecording(recId);
        if (user) void deleteRecordingFromCloud(user, recId, rec?.audioUrl);
      })();
    },
    [user]
  );

  const handleDeleteVideo = useCallback(
    (videoId: string) => {
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      void (async () => {
        const clip = await getVideo(videoId);
        deleteFile(clip?.localUri);
        await deleteVideo(videoId);
        if (user) void deleteVideoFromCloud(user, videoId, clip?.videoUrl);
      })();
    },
    [user]
  );

  if (!activeChild) {
    return (
      <Screen scroll={false} edges={['top']} className="items-center justify-center">
        <Text className="text-echo-gray font-nunito">No child selected.</Text>
      </Screen>
    );
  }

  const header = (
    <View>
      {/* Header */}
      <View className="px-4 pt-6 pb-3">
        <Text className="font-nunito-extrabold text-2xl text-echo-charcoal dark:text-white">💫 Memories</Text>
        <Text className="font-inter text-echo-gray text-sm mt-0.5">{activeChild.name}'s voice echoes</Text>
      </View>

      {/* View toggle */}
      <View className="px-4 mb-3">
        <View className="flex-row self-start bg-white dark:bg-echo-dark-card rounded-full p-1" style={shadows.soft}>
          {(['timeline', 'calendar', 'growth'] as const).map((mode) => (
            <Pressable
              key={mode}
              testID={`memories-view-${mode}`}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === mode }}
              onPress={() => {
                stopCurrentPlayback();
                setViewMode(mode);
              }}
              className={`px-4 py-1.5 rounded-full active:opacity-80 ${viewMode === mode ? 'bg-echo-coral' : ''}`}
            >
              <Text className={`font-nunito-bold text-sm ${viewMode === mode ? 'text-white' : 'text-echo-gray'}`}>
                {VIEW_LABELS[mode]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Media type toggle */}
      <View className="px-4 mb-3">
        <View className="flex-row self-start bg-white dark:bg-echo-dark-card rounded-full p-1" style={shadows.soft}>
          {(['all', 'audio', 'video'] as const).map((type) => (
            <Pressable
              key={type}
              testID={`memories-media-${type}`}
              accessibilityRole="button"
              accessibilityState={{ selected: mediaType === type }}
              onPress={() => {
                setMediaType(type);
                if (type === 'video') setActiveCategory(null);
              }}
              className={`px-4 py-1.5 rounded-full active:opacity-80 ${mediaType === type ? 'bg-echo-sky' : ''}`}
            >
              <Text className={`font-nunito-bold text-sm ${mediaType === type ? 'text-white' : 'text-echo-gray'}`}>
                {MEDIA_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Category filter chips (hidden in growth view and video-only mode) */}
      {viewMode !== 'growth' && mediaType !== 'video' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
          contentContainerClassName="px-4 gap-2 pb-1"
        >
          {CATEGORY_CHIPS.map((chip) => {
            const isActive = activeCategory === chip.key;
            const color = chip.key ? (CATEGORY_COLORS[chip.key] ?? '#8E8E93') : '#8E8E93';
            return (
              <Pressable
                key={chip.key ?? 'all'}
                testID={`memories-category-${chip.key ?? 'all'}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveCategory(chip.key)}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full active:opacity-80"
                style={{ backgroundColor: isActive ? color : '#F0F0F0' }}
              >
                <Text className="font-nunito-semibold text-xs">{chip.icon}</Text>
                <Text className="font-nunito-semibold text-xs" style={{ color: isActive ? 'white' : '#8E8E93' }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const isEmpty = groups.length === 0 && videos.length === 0;

  return (
    <Screen scroll={false} edges={['top']}>
      {loading ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {header}
          <View testID="memories-loading" className="items-center justify-center py-20">
            <Text className="text-3xl">🎵</Text>
          </View>
        </ScrollView>
      ) : isEmpty ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {header}
          <View testID="memories-empty" className="items-center justify-center py-16 px-8 gap-6">
            <EmptyMemoriesIllustration />
            <View className="items-center">
              <Text className="font-nunito-bold text-lg text-echo-charcoal dark:text-white text-center">No echoes yet</Text>
              <Text className="font-nunito text-echo-gray text-sm mt-1 text-center">
                Record {activeChild.name}'s first session to start building memories!
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : viewMode === 'timeline' ? (
        <TimelineView
          header={header}
          groups={groups}
          videos={videos}
          mediaType={mediaType}
          activeCategory={activeCategory}
          avatarEmoji={activeChild.avatarEmoji}
          expanded={expanded}
          onToggle={toggleExpanded}
          onDeleteRecording={handleDeleteRecording}
          onDeleteVideo={handleDeleteVideo}
        />
      ) : viewMode === 'calendar' ? (
        <CalendarView
          header={header}
          groups={groups}
          videos={videos}
          mediaType={mediaType}
          activeCategory={activeCategory}
          avatarEmoji={activeChild.avatarEmoji}
          calMonth={calMonth}
          onChangeMonth={setCalMonth}
          expanded={expanded}
          onToggle={toggleExpanded}
          onDeleteRecording={handleDeleteRecording}
          onDeleteVideo={handleDeleteVideo}
        />
      ) : (
        <GrowthView
          header={header}
          groups={groups}
          mediaType={mediaType}
          childId={activeChild.id}
          settings={growth}
          onChangeSettings={setGrowth}
        />
      )}
    </Screen>
  );
}
