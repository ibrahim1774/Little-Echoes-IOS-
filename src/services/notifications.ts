/**
 * Daily reminders as local scheduled notifications.
 */
import * as Notifications from 'expo-notifications';

import type { ParentSettings } from '@/types';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKS_AHEAD_WHEN_SKIPPING = 4;

const CONTENT = {
  title: "Time for today's echo! 🎤",
  body: "Tap to start recording today's questions.",
  sound: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function hasNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export function parseReminderTime(reminderTime: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(reminderTime ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Replace all scheduled reminders with ones matching the settings.
 * `skipToday` drops today's reminder (the session is already done) while
 * keeping the same weekday on following weeks.
 */
export async function scheduleReminders(
  settings: Pick<ParentSettings, 'reminderTime' | 'reminderDays'>,
  options: { skipToday?: boolean; now?: Date } = {}
): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const time = parseReminderTime(settings.reminderTime);
  if (!time || !settings.reminderDays?.length) return 0;
  if (!(await hasNotificationPermission())) return 0;

  const now = options.now ?? new Date();
  const todayIndex = now.getDay();
  let scheduled = 0;

  for (const day of settings.reminderDays) {
    const dayIndex = DAY_NAMES.indexOf(day);
    if (dayIndex < 0) continue;

    if (options.skipToday && dayIndex === todayIndex) {
      // A repeating trigger can't skip its next firing, so use dated one-offs
      // until the app next opens and restores the weekly trigger.
      for (let week = 1; week <= WEEKS_AHEAD_WHEN_SKIPPING; week++) {
        const date = new Date(now);
        date.setDate(date.getDate() + 7 * week);
        date.setHours(time.hour, time.minute, 0, 0);
        await Notifications.scheduleNotificationAsync({
          content: CONTENT,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        });
        scheduled++;
      }
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: CONTENT,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: dayIndex + 1, // 1 = Sunday
        hour: time.hour,
        minute: time.minute,
      },
    });
    scheduled++;
  }
  return scheduled;
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
