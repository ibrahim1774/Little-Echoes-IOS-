import { Pressable, Text } from 'react-native';

interface EmojiAvatarProps {
  emoji: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  selected?: boolean;
  onPress?: () => void;
  bgColor?: string;
}

const sizeMap = {
  sm: { box: 'w-10 h-10', text: 'text-xl' },
  md: { box: 'w-14 h-14', text: 'text-2xl' },
  lg: { box: 'w-16 h-16', text: 'text-3xl' },
  xl: { box: 'w-20 h-20', text: 'text-4xl' },
};

export function EmojiAvatar({ emoji, size = 'md', selected = false, onPress, bgColor = 'bg-echo-cream' }: EmojiAvatarProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Avatar ${emoji}`}
      className={`${sizeMap[size].box} ${bgColor} rounded-full items-center justify-center active:opacity-80 ${
        selected ? 'border-4 border-echo-coral' : ''
      }`}
    >
      <Text className={sizeMap[size].text}>{emoji}</Text>
    </Pressable>
  );
}
