import { useRef, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import Svg, { Path } from 'react-native-svg';

import { toDateStr } from '@/lib/logic';
import { colors, shadows } from '@/lib/theme';
import type { Recording, VideoClip } from '@/types';

import { DayHeading, EmptyNote } from './CardParts';
import {
  buildCalendarGrid,
  categoryOf,
  DAY_LABELS,
  formatDate,
  MONTH_NAMES,
  ymd,
  type GroupedSession,
  type MediaType,
} from './helpers';
import { RecordingCard } from './RecordingCard';
import { VideoCard } from './VideoCard';

export interface CalMonth {
  year: number;
  month: number;
}

interface CalendarViewProps {
  header: ReactElement;
  groups: GroupedSession[];
  videos: VideoClip[];
  mediaType: MediaType;
  activeCategory: string | null;
  avatarEmoji: string;
  calMonth: CalMonth;
  onChangeMonth: (next: CalMonth) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDeleteRecording: (id: string) => void;
  onDeleteVideo: (id: string) => void;
}

const CELL_WIDTH = `${100 / 7}%` as const;

export function CalendarView({
  header,
  groups,
  videos,
  mediaType,
  activeCategory,
  avatarEmoji,
  calMonth,
  onChangeMonth,
  expanded,
  onToggle,
  onDeleteRecording,
  onDeleteVideo,
}: CalendarViewProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const scrollRef = useRef<ScrollView>(null);
  const dayListY = useRef(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const datesWithContent = new Set([
    ...(mediaType !== 'video' ? groups.map((g) => g.session.date) : []),
    ...(mediaType !== 'audio' ? videos.map((v) => v.date) : []),
  ]);

  const calendarCells = buildCalendarGrid(calMonth.year, calMonth.month);
  const todayStr = toDateStr();

  const selectedDayRecs: Recording[] =
    selectedDate && mediaType !== 'video'
      ? groups
          .filter((g) => g.session.date === selectedDate)
          .flatMap((g) => g.recordings)
          .filter((r) => !activeCategory || categoryOf(r) === activeCategory)
      : [];

  const selectedDayVideos: VideoClip[] =
    selectedDate && mediaType !== 'audio' ? videos.filter((v) => v.date === selectedDate) : [];

  function prevMonth() {
    onChangeMonth(calMonth.month === 0 ? { year: calMonth.year - 1, month: 11 } : { ...calMonth, month: calMonth.month - 1 });
    setSelectedDate(null);
  }

  function nextMonth() {
    onChangeMonth(calMonth.month === 11 ? { year: calMonth.year + 1, month: 0 } : { ...calMonth, month: calMonth.month + 1 });
    setSelectedDate(null);
  }

  function selectDay(dateStr: string) {
    const next = selectedDate === dateStr ? null : dateStr;
    setSelectedDate(next);
    if (next) setTimeout(() => scrollRef.current?.scrollTo({ y: dayListY.current, animated: true }), 100);
  }

  const chevronColor = dark ? 'white' : colors.charcoal;

  return (
    <ScrollView
      ref={scrollRef}
      testID="memories-calendar"
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {header}
      <View className="px-4">
        <View className="bg-white dark:bg-echo-dark-card rounded-2xl p-4 mb-4" style={shadows.soft}>
          {/* Month navigation */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              testID="memories-cal-prev"
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={prevMonth}
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-echo-light-gray dark:bg-white/10 items-center justify-center active:opacity-80"
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={chevronColor} strokeWidth={2.5}>
                <Path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>

            <Text testID="memories-cal-month" className="font-nunito-extrabold text-base text-echo-charcoal dark:text-white">
              {MONTH_NAMES[calMonth.month]} {calMonth.year}
            </Text>

            <Pressable
              testID="memories-cal-next"
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={nextMonth}
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-echo-light-gray dark:bg-white/10 items-center justify-center active:opacity-80"
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={chevronColor} strokeWidth={2.5}>
                <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>

          {/* Day-of-week labels */}
          <View className="flex-row mb-1">
            {DAY_LABELS.map((d) => (
              <View key={d} className="py-1" style={{ width: CELL_WIDTH }}>
                <Text className="text-center font-inter-semibold text-xs text-echo-gray">{d}</Text>
              </View>
            ))}
          </View>

          {/* Day cells */}
          <View className="flex-row flex-wrap">
            {calendarCells.map((day, i) => {
              if (day === null) return <View key={`blank-${i}`} style={{ width: CELL_WIDTH }} />;
              const dateStr = ymd(calMonth.year, calMonth.month, day);
              const hasRec = datesWithContent.has(dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === todayStr;

              return (
                <View key={dateStr} className="mb-1" style={{ width: CELL_WIDTH }}>
                  <Pressable
                    testID={`memories-cal-day-${dateStr}`}
                    accessibilityRole="button"
                    accessibilityLabel={formatDate(dateStr)}
                    accessibilityState={{ selected: isSelected, disabled: !hasRec }}
                    onPress={() => selectDay(dateStr)}
                    disabled={!hasRec}
                    className="items-center justify-center py-1.5 rounded-xl"
                    style={isSelected ? { backgroundColor: '#FF6B6B' } : isToday ? { backgroundColor: '#F0F0F0' } : undefined}
                  >
                    <Text
                      className="font-nunito-bold text-sm"
                      style={{
                        lineHeight: 16,
                        color: isSelected ? 'white' : hasRec ? (dark && !isToday ? 'white' : '#2D2D2D') : '#C7C7CC',
                      }}
                    >
                      {day}
                    </Text>
                    {hasRec && (
                      <View
                        className="w-1.5 h-1.5 rounded-full mt-0.5"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.75)' : '#FF6B6B' }}
                      />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* Selected day recordings & videos */}
        {selectedDate ? (
          <View onLayout={(e) => { dayListY.current = e.nativeEvent.layout.y; }}>
            <DayHeading emoji={avatarEmoji} label={formatDate(selectedDate)} />
            {selectedDayRecs.length === 0 && selectedDayVideos.length === 0 ? (
              <View className="items-center py-8 gap-2">
                <Text className="text-3xl">🔍</Text>
                <Text className="font-nunito text-echo-gray text-sm text-center">
                  {activeCategory ? 'No echoes in this category on this day.' : 'No echoes on this day.'}
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {selectedDayRecs.map((rec) => (
                  <RecordingCard key={rec.id} rec={rec} isOpen={expanded.has(rec.id)} onToggle={onToggle} onDelete={onDeleteRecording} />
                ))}
                {selectedDayVideos.map((clip) => (
                  <VideoCard key={clip.id} clip={clip} isOpen={expanded.has(clip.id)} onToggle={onToggle} onDelete={onDeleteVideo} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <EmptyNote emoji="👆" text="Tap a highlighted day to see that day's echoes" className="py-10 gap-2 px-8" />
        )}
      </View>
    </ScrollView>
  );
}
