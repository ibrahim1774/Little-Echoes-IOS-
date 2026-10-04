import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useApp } from '@/context/AppContext';
import { useSubscriptionReady } from '@/context/SubscriptionReady';
import { destinationFor } from '@/lib/routing';

export default function Index() {
  const { state } = useApp();
  const subscriptionReady = useSubscriptionReady();

  // Signed-out users don't need a subscription status to start onboarding.
  if (state.isLoading || (state.user && !subscriptionReady && !state.isPaid)) {
    return (
      <View className="flex-1 items-center justify-center bg-echo-cream">
        <Text className="text-4xl">🎵</Text>
      </View>
    );
  }
  return <Redirect href={destinationFor(state)} />;
}
