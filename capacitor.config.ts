import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rillcod.academy',
  appName: 'Rillcod Technologies',
  webDir: 'www',
  // Keep native/JavaScript logs out of release builds while retaining them in debug builds.
  loggingBehavior: 'debug',
  server: {
    // Cold start → login; middleware/login page send signed-in users to dashboard.
    url: 'https://www.rillcod.com/login',
    cleartext: false,
    androidScheme: 'https',
    // Local packaged recovery screen for DNS, TLS, HTTP and WebView load failures.
    errorPath: 'offline.html',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide is a fail-safe because the remote page may never hydrate while offline.
      // CapacitorBoot still hides it sooner after the first successful paint.
      launchShowDuration: 1400,
      launchAutoHide: true,
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
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#0f0f1a',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
