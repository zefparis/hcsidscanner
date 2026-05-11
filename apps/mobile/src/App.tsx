/**
 * HCS ID Scanner Mobile - Entry Point
 *
 * Flow: ScanMRZ → ReadNFC → Result
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation/RootNavigator';
import type { AppConfig } from './ConfigContext';

// TODO: Load from .env via react-native-dotenv
const CONFIG: AppConfig = {
  apiUrl: process.env.API_URL || '',
  tenantId: process.env.TENANT_ID || '',
  apiToken: process.env.API_TOKEN || '',
  enableNfc: process.env.ENABLE_NFC === 'true',
  requireNfc: process.env.REQUIRE_NFC === 'true',
  requireFaceMatch: process.env.REQUIRE_FACE_MATCH !== 'false',
  minFaceMatchScore: parseInt(process.env.MIN_FACE_MATCH_SCORE || '80', 10),
};

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator config={CONFIG} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
