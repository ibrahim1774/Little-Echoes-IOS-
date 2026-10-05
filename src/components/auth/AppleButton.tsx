import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { isAppleSignInAvailable } from '@/services/auth';

interface AppleButtonProps {
  onPress: () => void;
  disabled?: boolean;
  darkMode?: boolean;
  testID: string;
}

/** Apple's own "Continue with Apple" button, as the Human Interface Guidelines require. */
export function AppleButton({ onPress, disabled, darkMode, testID }: AppleButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAvailable);
  }, []);

  if (!available) return null;

  return (
    <View testID={testID} className={`w-full ${disabled ? 'opacity-60' : ''}`} pointerEvents={disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          darkMode
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={999}
        style={{ width: '100%', height: 50 }}
        onPress={onPress}
      />
    </View>
  );
}
