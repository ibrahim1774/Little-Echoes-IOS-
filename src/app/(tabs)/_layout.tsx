import { Redirect, Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/BottomTabBar';
import { LaunchSplash } from '@/components/LaunchSplash';
import { useApp } from '@/context/AppContext';
import { useSubscriptionReady } from '@/context/SubscriptionReady';
import { gateFor } from '@/lib/routing';

export default function TabsLayout() {
  const { state } = useApp();
  // A deep link can open a tab directly on a cold launch, so this layout applies the same
  // gate as the index route: wait while loading, then let only subscribers in.
  const gate = gateFor(state, useSubscriptionReady());
  if (gate === 'loading') return <LaunchSplash />;
  // Losing the session or the subscription (expiry, refund) sends the user back out of the app.
  if (gate !== '/home') return <Redirect href={gate} />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="today" options={{ title: 'Record' }} />
      <Tabs.Screen name="videos" options={{ title: 'Video' }} />
      <Tabs.Screen name="memories" options={{ title: 'Memories' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
