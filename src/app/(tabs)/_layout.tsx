import { Redirect, Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/BottomTabBar';
import { useApp } from '@/context/AppContext';
import { destinationFor } from '@/lib/routing';

export default function TabsLayout() {
  const { state } = useApp();
  const destination = destinationFor(state);
  // Losing the session or the subscription sends the user back out of the app.
  if (destination !== '/home') return <Redirect href={destination} />;

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
