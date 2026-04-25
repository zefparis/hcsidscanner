import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iasolution.hcsidscanner',
  appName: 'HCS ID Scanner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    minWebViewVersion: 80,
  },
  plugins: {
    Browser: {
      // Custom Chrome Tab — used by IDVerificationStart for the OIDC dance.
      // Keep the in-app default; no in-app WebView for OIDC.
    },
  },
};

export default config;
