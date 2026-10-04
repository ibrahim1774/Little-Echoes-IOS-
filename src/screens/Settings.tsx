import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { colorScheme } from 'nativewind';
import Svg, { Path, Polyline } from 'react-native-svg';

import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { colors, shadows } from '@/lib/theme';
import { deleteAccount, signOut } from '@/services/auth';
import { syncToCloud } from '@/services/cloudSync';
import {
  cancelReminders,
  hasNotificationPermission,
  parseReminderTime,
  requestNotificationPermission,
  scheduleReminders,
} from '@/services/notifications';
import {
  deleteQuestion,
  getCustomQuestions,
  saveChild,
  saveCustomQuestion,
  saveParent,
} from '@/services/storage';
import { openManageSubscriptions, PLACEMENTS, usePaywall, useRestorePurchases } from '@/services/subscription';
import type { AgeGroup, ChildProfile, ParentProfile, Question, QuestionCategory } from '@/types';

function PencilIcon() {
  return (
    <Svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.gray}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}

function TrashIcon() {
  return (
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
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <Path d="M10 11v6M14 11v6" />
      <Path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </Svg>
  );
}

function Toggle({
  value,
  onPress,
  label,
  testID,
}: {
  value: boolean;
  onPress: () => void;
  label: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={onPress}
      className={`w-12 h-6 rounded-full ${value ? 'bg-echo-coral' : 'bg-echo-light-gray'}`}
    >
      <View
        className="w-5 h-5 bg-white rounded-full absolute"
        style={{ top: 2, left: value ? 26 : 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}
      />
    </Pressable>
  );
}

const CATEGORY_OPTIONS: { value: QuestionCategory; label: string }[] = [
  { value: 'favorites', label: 'Favorites & Fun' },
  { value: 'challenges', label: 'Challenges & Growth' },
  { value: 'emotions', label: 'Emotions & Relationships' },
  { value: 'learning', label: 'Learning & Wonder' },
  { value: 'gratitude', label: 'Gratitude & Reflection' },
];

const AGE_GROUP_OPTIONS: AgeGroup[] = ['1-2', '3-4', '5-6', '7-9', '10-12'];
const DEFAULT_REMINDER_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_OPTIONS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<string, string> = {
  mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su',
};

const CARD = 'bg-white dark:bg-echo-dark-card rounded-2xl p-4';
const CARD_LABEL = 'font-inter text-xs text-echo-gray uppercase tracking-wide mb-3';

function timeToDate(reminderTime: string): Date {
  const time = parseReminderTime(reminderTime) ?? { hour: 18, minute: 0 };
  const d = new Date();
  d.setHours(time.hour, time.minute, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Settings() {
  const { state, dispatch } = useApp();
  const { parent, activeChild, darkMode, user, tier } = state;

  // Subscription
  const { present, error: paywallError } = usePaywall();
  const restorePurchases = useRestorePurchases();
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Parent name edit
  const [editingParent, setEditingParent] = useState(false);
  const [parentNameDraft, setParentNameDraft] = useState('');

  // Child name edit
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [childNameDraft, setChildNameDraft] = useState('');

  // Account
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Reminders
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('18:00');
  const [reminderDays, setReminderDays] = useState<string[]>(DEFAULT_REMINDER_DAYS);
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  // Scheduling replaces every pending reminder, so calls must not overlap.
  const reminderQueue = useRef<Promise<unknown>>(Promise.resolve());

  // Custom questions
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);
  const [newQText, setNewQText] = useState('');
  const [newQCategory, setNewQCategory] = useState<QuestionCategory>('favorites');
  const [newQAgeGroups, setNewQAgeGroups] = useState<AgeGroup[]>(['1-2', '3-4', '5-6', '7-9', '10-12']);
  const [savingQ, setSavingQ] = useState(false);

  const parentId = parent?.id;
  const savedReminderTime = parent?.settings?.reminderTime;
  const savedReminderDays = parent?.settings?.reminderDays;
  const savedDaysKey = (savedReminderDays ?? []).join(',');

  // Load reminder settings from parent. "Off" is stored as an empty day list.
  useEffect(() => {
    if (!parentId) return;
    let cancelled = false;
    const days = savedDaysKey ? savedDaysKey.split(',') : [];
    setReminderTime(savedReminderTime || '18:00');
    setReminderDays(days.length > 0 ? days : DEFAULT_REMINDER_DAYS);
    void hasNotificationPermission()
      .catch(() => false)
      .then((granted) => {
        if (!cancelled) setRemindersEnabled(granted && days.length > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId, savedReminderTime, savedDaysKey]);

  // Load custom questions
  useEffect(() => {
    if (!parentId) return;
    let cancelled = false;
    void getCustomQuestions(parentId).then((qs) => {
      if (!cancelled) setCustomQuestions(qs);
    });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  async function persistParent(updated: ParentProfile) {
    await saveParent(updated);
    dispatch({ type: 'SET_PARENT', payload: updated });
    if (user) void syncToCloud(user);
  }

  async function toggleDarkMode() {
    const next = !darkMode;
    colorScheme.set(next ? 'dark' : 'light');
    dispatch({ type: 'SET_DARK_MODE', payload: next });
    if (parent) await persistParent({ ...parent, settings: { ...parent.settings, darkMode: next } });
  }

  function startEditParent() {
    if (!parent) return;
    setParentNameDraft(parent.name);
    setEditingParent(true);
  }

  async function saveParentName() {
    if (!parent || !parentNameDraft.trim()) return;
    await persistParent({ ...parent, name: parentNameDraft.trim() });
    setEditingParent(false);
  }

  function startEditChild(child: ChildProfile) {
    setChildNameDraft(child.name);
    setEditingChildId(child.id);
  }

  async function saveChildName() {
    const child = state.children.find((c) => c.id === editingChildId);
    if (!child || !childNameDraft.trim()) return;
    const updated = { ...child, name: childNameDraft.trim() };
    await saveChild(updated);
    if (activeChild?.id === updated.id) dispatch({ type: 'SET_ACTIVE_CHILD', payload: updated });
    dispatch({
      type: 'SET_CHILDREN',
      payload: state.children.map((c) => (c.id === updated.id ? updated : c)),
    });
    if (user) void syncToCloud(user);
    setEditingChildId(null);
  }

  function applyReminders(settings: ParentProfile['settings']) {
    const skipToday = state.todaySession?.status === 'completed';
    reminderQueue.current = reminderQueue.current
      .then(async () => {
        if (settings.reminderDays.length > 0) await scheduleReminders(settings, { skipToday });
        else await cancelReminders();
      })
      .catch((err) => console.warn('[Settings] Could not update reminders', err));
  }

  async function saveReminderSettings(time: string, days: string[]) {
    if (!parent) return;
    const updated = { ...parent, settings: { ...parent.settings, reminderTime: time, reminderDays: days } };
    await persistParent(updated);
    applyReminders(updated.settings);
  }

  async function toggleReminders() {
    if (remindersEnabled) {
      setRemindersEnabled(false);
      await saveReminderSettings(reminderTime, []);
      return;
    }
    const granted = await requestNotificationPermission().catch(() => false);
    if (!granted) {
      setNotificationsDenied(true);
      return;
    }
    setNotificationsDenied(false);
    setRemindersEnabled(true);
    await saveReminderSettings(reminderTime, reminderDays);
  }

  function changeReminderTime(date: Date | undefined) {
    if (!date) return;
    const next = dateToTime(date);
    if (next === reminderTime) return;
    setReminderTime(next);
    void saveReminderSettings(next, reminderDays);
  }

  function toggleReminderDay(day: string) {
    const next = reminderDays.includes(day) ? reminderDays.filter((d) => d !== day) : [...reminderDays, day];
    // An empty list means "off"; the switch above is the way to turn reminders off.
    if (next.length === 0) return;
    setReminderDays(next);
    void saveReminderSettings(reminderTime, next);
  }

  async function addCustomQuestion() {
    if (!parent || !newQText.trim() || newQAgeGroups.length === 0) return;
    setSavingQ(true);
    const q: Question = {
      id: `custom-${Date.now()}`,
      text: newQText.trim(),
      category: newQCategory,
      ageGroups: newQAgeGroups,
      isCustom: true,
      createdBy: parent.id,
    };
    try {
      await saveCustomQuestion(q);
      setCustomQuestions((prev) => [...prev, q]);
      setNewQText('');
    } finally {
      setSavingQ(false);
    }
  }

  async function removeCustomQuestion(id: string) {
    await deleteQuestion(id);
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function toggleAgeGroup(ag: AgeGroup) {
    setNewQAgeGroups((prev) => (prev.includes(ag) ? prev.filter((a) => a !== ag) : [...prev, ag]));
  }

  async function handleUpgrade() {
    setUpgradeLoading(true);
    try {
      await present(PLACEMENTS.settingsUpgrade);
    } finally {
      setUpgradeLoading(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    Alert.alert('Restore Purchases', result.message);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut(user);
      router.replace('/');
    } catch (err) {
      console.warn('[Settings] Sign out failed', err);
      setSigningOut(false);
      Alert.alert("Couldn't sign out", 'Please check your connection and try again.');
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, all profiles, recordings and videos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void handleDeleteAccount() },
      ]
    );
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await deleteAccount();
      if (result.error) {
        setDeleteError(result.error);
        setDeleting(false);
        return;
      }
      router.replace('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the account. Please try again.');
      setDeleting(false);
    }
  }

  const nameInputClass =
    'w-full font-nunito-bold text-echo-charcoal dark:text-white bg-echo-cream dark:bg-echo-dark-bg border-2 border-echo-coral rounded-xl px-3 py-1.5 text-sm';

  return (
    <Screen edges={['top']} className="pb-6">
      {/* Header */}
      <View className="px-4 pt-6 pb-4">
        <Text className="font-nunito-extrabold text-2xl text-echo-charcoal dark:text-white">Settings</Text>
      </View>

      <View className="px-4 gap-3">
        {/* Parent profile */}
        {parent && (
          <View className={CARD} style={shadows.soft}>
            <Text className={CARD_LABEL}>Parent Profile</Text>
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-echo-cream dark:bg-echo-dark-bg items-center justify-center">
                <Text className="text-2xl">{parent.avatarEmoji}</Text>
              </View>
              <View className="flex-1">
                {editingParent ? (
                  <View className="gap-2">
                    <TextInput
                      testID="settings-parent-name"
                      autoFocus
                      value={parentNameDraft}
                      onChangeText={setParentNameDraft}
                      onSubmitEditing={() => void saveParentName()}
                      returnKeyType="done"
                      className={nameInputClass}
                      placeholder="Your name"
                      placeholderTextColor={colors.gray}
                      maxLength={40}
                    />
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        testID="settings-parent-save"
                        accessibilityRole="button"
                        onPress={() => void saveParentName()}
                        className="bg-echo-coral px-3 py-1.5 rounded-full active:opacity-80"
                      >
                        <Text className="font-nunito-bold text-xs text-white">Save</Text>
                      </Pressable>
                      <Pressable
                        testID="settings-parent-cancel"
                        accessibilityRole="button"
                        onPress={() => setEditingParent(false)}
                        className="px-2 py-1.5 active:opacity-80"
                      >
                        <Text className="font-nunito text-xs text-echo-gray">Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white">{parent.name}</Text>
                      <Text className="font-inter text-xs text-echo-gray">Parent</Text>
                    </View>
                    <Pressable
                      testID="settings-parent-edit"
                      accessibilityRole="button"
                      accessibilityLabel="Edit parent name"
                      onPress={startEditParent}
                      className="p-2 rounded-xl active:opacity-80"
                    >
                      <PencilIcon />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Child profiles */}
        {state.children.map((child) => (
          <View key={child.id} className={CARD} style={shadows.soft}>
            <Text className={CARD_LABEL}>Child</Text>
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-echo-cream dark:bg-echo-dark-bg items-center justify-center">
                <Text className="text-2xl">{child.avatarEmoji}</Text>
              </View>
              <View className="flex-1">
                {editingChildId === child.id ? (
                  <View className="gap-2">
                    <TextInput
                      testID="settings-child-name"
                      autoFocus
                      value={childNameDraft}
                      onChangeText={setChildNameDraft}
                      onSubmitEditing={() => void saveChildName()}
                      returnKeyType="done"
                      className={nameInputClass}
                      placeholder="Child's name"
                      placeholderTextColor={colors.gray}
                      maxLength={40}
                    />
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        testID="settings-child-save"
                        accessibilityRole="button"
                        onPress={() => void saveChildName()}
                        className="bg-echo-coral px-3 py-1.5 rounded-full active:opacity-80"
                      >
                        <Text className="font-nunito-bold text-xs text-white">Save</Text>
                      </Pressable>
                      <Pressable
                        testID="settings-child-cancel"
                        accessibilityRole="button"
                        onPress={() => setEditingChildId(null)}
                        className="px-2 py-1.5 active:opacity-80"
                      >
                        <Text className="font-nunito text-xs text-echo-gray">Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-nunito-bold text-base text-echo-charcoal dark:text-white">{child.name}</Text>
                      <Text className="font-inter text-xs text-echo-gray">Age group: {child.ageGroup}</Text>
                      {child.schoolName && <Text className="font-inter text-xs text-echo-gray">{child.schoolName}</Text>}
                    </View>
                    <Pressable
                      testID={`settings-child-edit-${child.id}`}
                      accessibilityRole="button"
                      accessibilityLabel="Edit child name"
                      onPress={() => startEditChild(child)}
                      className="p-2 rounded-xl active:opacity-80"
                    >
                      <PencilIcon />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        ))}

        {/* Add child button */}
        <Pressable
          testID="settings-add-child"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/setup/child', params: { from: 'settings' } })}
          className={`${CARD} flex-row items-center gap-3 active:opacity-80`}
          style={shadows.soft}
        >
          <View className="w-12 h-12 rounded-full bg-echo-cream dark:bg-echo-dark-bg items-center justify-center">
            <Text className="font-nunito text-2xl text-echo-charcoal dark:text-white">+</Text>
          </View>
          <Text className="font-nunito-bold text-echo-coral text-sm">Add Another Child</Text>
        </Pressable>

        {/* Appearance */}
        <View className={CARD} style={shadows.soft}>
          <Text className={CARD_LABEL}>Appearance</Text>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-nunito-semibold text-echo-charcoal dark:text-white text-sm">Dark Mode</Text>
              <Text className="font-inter text-xs text-echo-gray mt-0.5">Easier on the eyes at night</Text>
            </View>
            <Toggle
              testID="settings-dark-mode"
              label="Toggle dark mode"
              value={darkMode}
              onPress={() => void toggleDarkMode()}
            />
          </View>
        </View>

        {/* Reminders */}
        <View className={CARD} style={shadows.soft}>
          <Text className={CARD_LABEL}>Reminders</Text>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1">
              <Text className="font-nunito-semibold text-echo-charcoal dark:text-white text-sm">Daily reminder</Text>
              <Text className="font-inter text-xs text-echo-gray mt-0.5">Get notified to record today's echoes</Text>
            </View>
            <Toggle
              testID="settings-reminders-toggle"
              label="Toggle reminders"
              value={remindersEnabled}
              onPress={() => void toggleReminders()}
            />
          </View>

          {notificationsDenied && !remindersEnabled && (
            <View className="pt-3 border-t border-echo-light-gray dark:border-white/10 gap-2 items-start">
              <Text testID="settings-notifications-denied" className="font-inter text-xs text-echo-coral">
                Notifications are off for Little Echoes. Turn them on in Settings.
              </Text>
              <Pressable
                testID="settings-open-settings"
                accessibilityRole="button"
                onPress={() => void Linking.openSettings()}
                className="px-3 py-1.5 rounded-full border-2 border-echo-coral active:opacity-80"
              >
                <Text className="font-nunito-bold text-xs text-echo-coral">Open Settings</Text>
              </Pressable>
            </View>
          )}

          {remindersEnabled && (
            <View className="gap-3 pt-3 border-t border-echo-light-gray dark:border-white/10">
              <View className="flex-row items-center gap-3">
                <Text className="font-inter text-xs text-echo-gray w-12">Time</Text>
                <DateTimePicker
                  testID="settings-reminder-time"
                  mode="time"
                  display="compact"
                  value={timeToDate(reminderTime)}
                  onChange={(_event, date) => changeReminderTime(date)}
                  accentColor={colors.coral}
                  themeVariant={darkMode ? 'dark' : 'light'}
                />
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="font-inter text-xs text-echo-gray w-12">Days</Text>
                <View className="flex-1 flex-row gap-1.5 flex-wrap">
                  {DAY_OPTIONS.map((day) => {
                    const selected = reminderDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        testID={`settings-reminder-day-${day}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => toggleReminderDay(day)}
                        className={`w-8 h-8 rounded-full items-center justify-center active:opacity-80 ${
                          selected ? 'bg-echo-coral' : 'bg-echo-light-gray'
                        }`}
                      >
                        <Text className={`font-nunito-bold text-xs ${selected ? 'text-white' : 'text-echo-gray'}`}>
                          {DAY_LABELS[day]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Custom Questions */}
        <View className={CARD} style={shadows.soft}>
          <Text className={CARD_LABEL}>Custom Questions</Text>

          {/* Existing custom questions */}
          {customQuestions.length > 0 && (
            <View className="gap-2 mb-4">
              {customQuestions.map((q) => (
                <View key={q.id} className="flex-row items-start gap-2 bg-echo-cream dark:bg-echo-dark-bg rounded-xl px-3 py-2">
                  <Text className="font-nunito text-sm text-echo-charcoal dark:text-white flex-1 leading-snug">{q.text}</Text>
                  <Pressable
                    testID={`settings-question-delete-${q.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Delete question"
                    hitSlop={10}
                    onPress={() => void removeCustomQuestion(q.id)}
                    className="mt-0.5 active:opacity-80"
                  >
                    <TrashIcon />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Add new question form */}
          <View className="gap-2.5">
            <TextInput
              testID="settings-question-text"
              value={newQText}
              onChangeText={setNewQText}
              placeholder="Write a question to ask your child..."
              placeholderTextColor={colors.gray}
              multiline
              maxLength={200}
              textAlignVertical="top"
              className="w-full bg-echo-cream dark:bg-echo-dark-bg font-nunito text-sm text-echo-charcoal dark:text-white rounded-xl px-3 py-2.5 min-h-[60px]"
            />
            <View className="flex-row flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((c) => {
                const selected = newQCategory === c.value;
                return (
                  <Pressable
                    key={c.value}
                    testID={`settings-question-category-${c.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setNewQCategory(c.value)}
                    className={`px-3 py-2 rounded-xl active:opacity-80 ${
                      selected ? 'bg-echo-coral' : 'bg-echo-cream dark:bg-echo-dark-bg'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${selected ? 'text-white' : 'text-echo-charcoal dark:text-white'}`}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row gap-1.5">
              {AGE_GROUP_OPTIONS.map((ag) => {
                const selected = newQAgeGroups.includes(ag);
                return (
                  <Pressable
                    key={ag}
                    testID={`settings-question-age-${ag}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => toggleAgeGroup(ag)}
                    className={`flex-1 py-1.5 rounded-xl items-center active:opacity-80 ${
                      selected ? 'bg-echo-coral' : 'bg-echo-light-gray'
                    }`}
                  >
                    <Text className={`font-inter-semibold text-xs ${selected ? 'text-white' : 'text-echo-gray'}`}>{ag}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID="settings-question-add"
              accessibilityRole="button"
              onPress={() => void addCustomQuestion()}
              disabled={!newQText.trim() || newQAgeGroups.length === 0 || savingQ}
              className={`w-full py-2.5 rounded-xl bg-echo-coral items-center active:opacity-80 ${
                !newQText.trim() || newQAgeGroups.length === 0 || savingQ ? 'opacity-50' : ''
              }`}
            >
              <Text className="font-nunito-bold text-sm text-white">{savingQ ? 'Saving...' : '+ Add Question'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Subscription */}
        {tier && (
          <View className={CARD} style={shadows.soft}>
            <Text className={CARD_LABEL}>Subscription</Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text testID="settings-plan" className="font-nunito-bold text-echo-charcoal dark:text-white text-sm">
                  {tier === 'pro' ? 'Pro' : 'Basic'}
                </Text>
                <Text className="font-inter text-xs text-echo-gray mt-0.5">
                  {tier === 'pro' ? 'Audio + video moments included' : 'Audio recordings only — video is a Pro feature'}
                </Text>
              </View>
              <View className={`px-3 py-1 rounded-full ${tier === 'pro' ? 'bg-echo-coral/15' : 'bg-echo-light-gray'}`}>
                <Text className={`font-nunito-bold text-xs ${tier === 'pro' ? 'text-echo-coral' : 'text-echo-gray'}`}>
                  {tier === 'pro' ? 'PRO' : 'BASIC'}
                </Text>
              </View>
            </View>

            {tier === 'basic' && (
              <Pressable
                testID="settings-upgrade"
                accessibilityRole="button"
                onPress={() => void handleUpgrade()}
                disabled={upgradeLoading}
                className={`w-full mt-3 py-2.5 rounded-xl bg-echo-coral items-center active:opacity-80 ${
                  upgradeLoading ? 'opacity-60' : ''
                }`}
              >
                <Text className="font-nunito-bold text-sm text-white">{upgradeLoading ? 'Opening...' : 'Upgrade to Pro'}</Text>
              </Pressable>
            )}

            <Pressable
              testID="settings-manage-subscription"
              accessibilityRole="button"
              onPress={openManageSubscriptions}
              className="w-full mt-3 py-2.5 rounded-xl border-2 border-echo-gray/30 items-center active:opacity-80"
            >
              <Text className="font-nunito-bold text-sm text-echo-gray">Manage subscription</Text>
            </Pressable>

            <Pressable
              testID="settings-restore-purchases"
              accessibilityRole="button"
              onPress={() => void handleRestore()}
              disabled={restoring}
              className={`w-full mt-2 py-2.5 items-center active:opacity-80 ${restoring ? 'opacity-60' : ''}`}
            >
              <Text className="font-nunito-bold text-sm text-echo-coral">{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
            </Pressable>

            {paywallError && (
              <Text testID="settings-subscription-error" className="font-inter text-xs text-red-500 text-center mt-2">
                {paywallError}
              </Text>
            )}
          </View>
        )}

        {/* About */}
        <View className={CARD} style={shadows.soft}>
          <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide mb-2">About</Text>
          <Text className="font-nunito text-sm text-echo-gray">LittleEchoes v1.0.0</Text>
          <Text className="font-nunito text-sm text-echo-gray mt-1">Made with love for families</Text>
        </View>

        {/* Account */}
        {user && (
          <View className={CARD} style={shadows.soft}>
            <Text className={CARD_LABEL}>Account</Text>
            <Pressable
              testID="settings-sign-out"
              accessibilityRole="button"
              onPress={() => void handleSignOut()}
              disabled={signingOut || deleting}
              className={`w-full py-2.5 rounded-xl border-2 border-echo-gray/30 items-center active:opacity-80 ${
                signingOut ? 'opacity-60' : ''
              }`}
            >
              <Text className="font-nunito-bold text-sm text-echo-gray">{signingOut ? 'Signing out…' : 'Sign Out'}</Text>
            </Pressable>
          </View>
        )}

        {/* Danger zone */}
        {user && (
          <View className={CARD} style={shadows.soft}>
            <Text className={CARD_LABEL}>Danger Zone</Text>
            <Pressable
              testID="settings-delete-account"
              accessibilityRole="button"
              onPress={confirmDeleteAccount}
              disabled={deleting || signingOut}
              className={`w-full py-2.5 rounded-xl border-2 border-red-400 items-center active:opacity-80 ${
                deleting ? 'opacity-60' : ''
              }`}
            >
              <Text className="font-nunito-bold text-sm text-red-500">{deleting ? 'Deleting...' : 'Delete account'}</Text>
            </Pressable>
            {deleteError !== '' && (
              <Text testID="settings-delete-error" className="font-inter text-xs text-red-500 text-center mt-2">
                {deleteError}
              </Text>
            )}
            <Text className="font-inter text-xs text-echo-gray mt-3 leading-relaxed">
              Deleting your account does not cancel your subscription. Cancel it in your Apple ID settings.
            </Text>
            <Pressable
              testID="settings-danger-manage-subscription"
              accessibilityRole="link"
              onPress={openManageSubscriptions}
              className="mt-1 self-start active:opacity-80"
            >
              <Text className="font-inter-semibold text-xs text-echo-coral underline">Manage subscription</Text>
            </Pressable>
          </View>
        )}

        {/* Legal */}
        <View className="flex-row items-center justify-center gap-4 pt-2">
          <Pressable
            testID="settings-privacy"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            className="active:opacity-80"
          >
            <Text className="font-inter text-xs text-echo-gray underline">Privacy Policy</Text>
          </Pressable>
          <Pressable
            testID="settings-terms"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(TERMS_URL)}
            className="active:opacity-80"
          >
            <Text className="font-inter text-xs text-echo-gray underline">Terms of Use</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
