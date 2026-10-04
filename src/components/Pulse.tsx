import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  children: ReactNode;
  /** Peak scale. The web CTA pulse is 1.03. */
  scale?: number;
  /** Full cycle length in ms. */
  duration?: number;
}

/** Gentle breathing scale, replacing the web's pulse keyframes. */
export function Pulse({ children, scale = 1.03, duration = 2000 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(progress);
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (scale - 1) * progress.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
