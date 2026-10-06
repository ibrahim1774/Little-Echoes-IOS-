import { Text, View } from 'react-native';

/** Shown while the launch gate can't decide yet (loading data or subscription status). */
export function LaunchSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-echo-cream">
      <Text className="text-4xl">🎵</Text>
    </View>
  );
}
