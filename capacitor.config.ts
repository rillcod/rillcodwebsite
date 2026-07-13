import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rillcod.academy',
  appName: 'Rillcod Academy',
  webDir: 'www',
  server: {
    // Cold start → login; middleware/login page send signed-in users to dashboard.
    url: 'https://www.rillcod.com/login',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0f0f1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // LIGHT = light icons/text for dark brand background
      style: 'LIGHT',
      backgroundColor: '#0f0f1a',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f0f1a',
  },
  ios: {
    backgroundColor: '#0f0f1a',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
