import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { shadows } from '@/lib/theme';
import { PLACEMENTS, usePaywall } from '@/services/subscription';

const FEATURES: { icon: string; text: string }[] = [
  { icon: '📹', text: 'Daily video clips that can help you remember the little things' },
  { icon: '🎬', text: 'A Voice + Video Growth Timeline you may treasure for years' },
  { icon: '💡', text: 'Smart prompts that may make recording feel effortless' },
  { icon: '🔒', text: 'Same private cloud — your moments stay yours' },
];

export function VideoUpgradeScreen() {
  const { present, error } = usePaywall();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      await present(PLACEMENTS.videoGate);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top']} className="px-5 pt-8 pb-6">
      <View className="items-center gap-3 mb-6">
        <Text className="text-5xl mb-1">📹</Text>
        <Text className="font-nunito-extrabold text-[24px] leading-tight text-echo-charcoal dark:text-white text-center">
          Video moments are part of Pro
        </Text>
        <Text className="font-inter text-sm text-echo-gray leading-relaxed max-w-xs text-center">
          You're on the Basic plan, which keeps audio. Upgrading to Pro can help you capture the faces behind the voices.
        </Text>
      </View>

      <View className="bg-white dark:bg-echo-dark-card rounded-2xl p-4 gap-3" style={shadows.soft}>
        <Text className="font-inter text-xs text-echo-gray uppercase tracking-wide">With Pro you also get</Text>
        <View className="gap-2.5">
          {FEATURES.map((f) => (
            <View key={f.text} className="flex-row items-start gap-3">
              <View className="w-9 h-9 rounded-xl bg-echo-coral/10 items-center justify-center">
                <Text className="text-lg">{f.icon}</Text>
              </View>
              <Text className="flex-1 font-inter text-sm text-echo-charcoal dark:text-white leading-snug pt-1.5">
                {f.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="bg-echo-coral/10 border-2 border-echo-coral/30 rounded-2xl p-4 mt-4 items-center">
        <Text className="font-nunito-bold text-sm text-echo-coral">Pro — $9.99/month</Text>
        <Text className="font-inter text-xs text-echo-gray mt-1 text-center">
          Or $59.99/year. Same private cloud. Cancel anytime.
        </Text>
      </View>

      {error && (
        <Text testID="video-upgrade-error" className="font-inter text-xs text-red-500 text-center mt-4">
          {error}
        </Text>
      )}

      <View className="mt-auto pt-6 gap-2">
        <Pressable
          testID="video-upgrade-submit"
          accessibilityRole="button"
          onPress={() => void handleUpgrade()}
          disabled={loading}
          className={`w-full py-4 rounded-full bg-echo-coral items-center active:opacity-80 ${loading ? 'opacity-60' : ''}`}
          style={shadows.coral}
        >
          <Text className="font-nunito-extrabold text-base text-white">{loading ? 'Opening...' : 'Upgrade to Pro'}</Text>
        </Pressable>
        <Text className="font-inter text-xs text-echo-gray text-center">
          Billed through your Apple ID. Cancel anytime in Settings.
        </Text>
      </View>
    </Screen>
  );
}
