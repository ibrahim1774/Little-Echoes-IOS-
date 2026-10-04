import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, View } from 'react-native';

import type { VideoClip } from '@/types';

import { DayHeading, EmptyNote } from './CardParts';
import { buildTimelineRows, formatDate, type GroupedSession, type MediaType, type TimelineRow } from './helpers';
import { RecordingCard } from './RecordingCard';
import { VideoCard } from './VideoCard';

interface TimelineViewProps {
  header: ReactElement;
  groups: GroupedSession[];
  videos: VideoClip[];
  mediaType: MediaType;
  activeCategory: string | null;
  avatarEmoji: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDeleteRecording: (id: string) => void;
  onDeleteVideo: (id: string) => void;
}

export function TimelineView({
  header,
  groups,
  videos,
  mediaType,
  activeCategory,
  avatarEmoji,
  expanded,
  onToggle,
  onDeleteRecording,
  onDeleteVideo,
}: TimelineViewProps) {
  const rows = useMemo(
    () => buildTimelineRows(groups, videos, mediaType, activeCategory),
    [groups, videos, mediaType, activeCategory]
  );

  const renderItem = useCallback(
    ({ item }: { item: TimelineRow }) => {
      if (item.kind === 'header') {
        return (
          <View className={`px-4 ${item.first ? '' : 'mt-4'}`}>
            <DayHeading emoji={avatarEmoji} label={formatDate(item.date)} />
          </View>
        );
      }
      return (
        <View className="px-4 mb-2">
          {item.kind === 'recording' ? (
            <RecordingCard rec={item.rec} isOpen={expanded.has(item.rec.id)} onToggle={onToggle} onDelete={onDeleteRecording} />
          ) : (
            <VideoCard clip={item.clip} isOpen={expanded.has(item.clip.id)} onToggle={onToggle} onDelete={onDeleteVideo} />
          )}
        </View>
      );
    },
    [avatarEmoji, expanded, onToggle, onDeleteRecording, onDeleteVideo]
  );

  return (
    <FlatList
      testID="memories-timeline"
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      extraData={expanded}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyNote
          emoji="🔍"
          text={
            mediaType === 'video'
              ? 'No video clips yet.'
              : mediaType === 'audio'
              ? 'No audio echoes in this category yet.'
              : 'No echoes in this category yet.'
          }
        />
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      windowSize={9}
    />
  );
}
