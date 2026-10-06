import { Redirect } from 'expo-router';

import { LaunchSplash } from '@/components/LaunchSplash';
import { useApp } from '@/context/AppContext';
import { useSubscriptionReady } from '@/context/SubscriptionReady';
import { gateFor } from '@/lib/routing';

export default function Index() {
  const { state } = useApp();
  const gate = gateFor(state, useSubscriptionReady());
  if (gate === 'loading') return <LaunchSplash />;
  return <Redirect href={gate} />;
}
