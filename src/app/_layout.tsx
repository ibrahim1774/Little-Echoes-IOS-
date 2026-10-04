import '../../global.css';

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SuperwallProvider } from 'expo-superwall';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { AppProvider, useApp } from '@/context/AppContext';
import { initAnalytics } from '@/services/analytics';
import { SubscriptionBridge } from '@/services/subscription';
import { SubscriptionReadyContext } from '@/context/SubscriptionReady';

void SplashScreen.preventAutoHideAsync();

function Shell() {
  const { state } = useApp();
  const [subscriptionReady, setSubscriptionReady] = useState(false);
  const onReady = useCallback(() => setSubscriptionReady(true), []);

  return (
    <SubscriptionReadyContext.Provider value={subscriptionReady}>
      <SubscriptionBridge onReady={onReady} />
      <StatusBar style={state.darkMode ? 'light' : 'dark'} />
      <View className={`flex-1 ${state.darkMode ? 'dark' : ''}`}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: state.darkMode ? '#1A1A2E' : '#FFF9F0' } }} />
      </View>
    </SubscriptionReadyContext.Provider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SuperwallProvider
        apiKeys={{ ios: process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY! }}
        // Development builds simulate purchases instead of talking to the App Store.
        options={{ testModeBehavior: __DEV__ ? 'always' : 'automatic' }}
      >
        <AppProvider>
          <Shell />
        </AppProvider>
      </SuperwallProvider>
    </SafeAreaProvider>
  );
}
