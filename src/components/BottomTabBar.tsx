import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useApp } from '@/context/AppContext';
import { colors } from '@/lib/theme';

const ICONS: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  today:
    'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z',
  videos: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  memories: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
};

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { state: app } = useApp();
  const insets = useSafeAreaInsets();
  const showLockOnVideo = app.tier === 'basic';

  return (
    <View
      className="flex-row items-center justify-around border-t border-echo-light-gray bg-white dark:bg-echo-dark-bg dark:border-white/10"
      style={{ paddingBottom: insets.bottom, height: 64 + insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const isActive = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;
        const featured = route.name === 'today';
        const size = featured ? 28 : 24;
        const tint = isActive ? colors.coral : colors.gray;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            testID={`tab-${route.name}`}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            className="flex-1 items-center justify-center pt-2 pb-1"
          >
            {isActive && <View className="absolute top-1 w-1 h-1 rounded-full bg-echo-coral" />}
            <View style={{ transform: [{ scale: isActive ? 1.1 : 1 }] }}>
              <Svg width={size} height={size} viewBox="0 0 24 24" fill={tint}>
                <Path d={ICONS[route.name]} />
              </Svg>
              {route.name === 'videos' && showLockOnVideo && (
                <View className="absolute -top-1 -right-1.5 bg-echo-charcoal rounded-full w-3.5 h-3.5 items-center justify-center">
                  <Text style={{ fontSize: 7 }}>🔒</Text>
                </View>
              )}
            </View>
            <Text className="font-nunito-semibold text-[10px] mt-0.5" style={{ color: tint }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
