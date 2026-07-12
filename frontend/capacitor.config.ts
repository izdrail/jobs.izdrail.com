import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.jobswipe',
  appName: 'JobSwipe',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      backgroundColor: '#121212',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#6C63FF',
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#121212'
    }
  }
};

export default config;
