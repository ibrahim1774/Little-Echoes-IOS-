import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

interface ScreenProps {
  children: ReactNode;
  /** Scroll when content is taller than the screen. Default true. */
  scroll?: boolean;
  /** Extra classes for the content container (padding, alignment). */
  className?: string;
  edges?: Edge[];
}

/** Cream/dark background, safe areas and keyboard handling for every screen. */
export function Screen({ children, scroll = true, className = '', edges = ['top', 'bottom'] }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-echo-cream dark:bg-echo-dark-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName={`grow ${className}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View className={`flex-1 ${className}`}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
