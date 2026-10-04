import type { ReactNode } from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';

import { shadows } from '@/lib/theme';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  fullWidth?: boolean;
  className?: string;
}

const variants = {
  primary: { box: 'bg-echo-coral', text: 'text-white' },
  secondary: { box: 'bg-transparent border-2 border-echo-coral', text: 'text-echo-coral' },
  ghost: { box: 'bg-transparent', text: 'text-echo-gray' },
};

const sizes = {
  sm: { box: 'px-4 py-2', text: 'text-sm' },
  md: { box: 'px-6 py-3', text: 'text-base' },
  lg: { box: 'px-8 py-4', text: 'text-lg' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={`rounded-full items-center justify-center active:opacity-80 ${variants[variant].box} ${sizes[size].box} ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-60' : ''} ${className}`}
      style={variant === 'primary' ? shadows.coral : undefined}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className={`font-nunito-bold ${variants[variant].text} ${sizes[size].text}`}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
