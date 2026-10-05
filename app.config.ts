import type { ExpoConfig } from 'expo/config';

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
// Reversed client ID is the URL scheme Google redirects back to after sign-in.
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

const config: ExpoConfig = {
  name: 'Little Echoes',
  slug: 'little-echoes',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'littleechoes',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.ibrahim1774.littleechoes',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Send Apple's SKAdNetwork / AdAttributionKit postback copies to AppsFlyer.
      NSAdvertisingAttributionReportEndpoint: 'https://appsflyer-skadnetwork.com/',
      NSMicrophoneUsageDescription:
        "Little Echoes uses the microphone to record your child's voice.",
      NSCameraUsageDescription:
        'Little Echoes uses the camera to record short video moments of your child.',
      NSUserTrackingUsageDescription:
        'This lets us understand which ads bring families to Little Echoes. Your recordings are never shared.',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#FFF9F0', image: './assets/images/splash-icon.png', imageWidth: 96 },
    ],
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
    'expo-secure-store',
    'expo-sqlite',
    ['expo-audio', { microphonePermission: "Little Echoes uses the microphone to record your child's voice." }],
    [
      'expo-camera',
      {
        cameraPermission: 'Little Echoes uses the camera to record short video moments of your child.',
        microphonePermission: "Little Echoes uses the microphone to record your child's voice.",
        recordAudioAndroid: true,
      },
    ],
    'expo-video',
    'expo-sharing',
    ['expo-notifications', { color: '#FF6B6B' }],
    [
      'expo-tracking-transparency',
      {
        userTrackingPermission:
          'This lets us understand which ads bring families to Little Echoes. Your recordings are never shared.',
      },
    ],
    'expo-localization',
    '@react-native-community/datetimepicker',
    ['react-native-appsflyer', {}],
    ...(googleIosUrlScheme
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, object]]
      : []),
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: 'dcf0a4bb-84dc-4fa9-94f2-03e2cb312c64' },
  },
  owner: 'ibrahim1774',
};

export default config;
