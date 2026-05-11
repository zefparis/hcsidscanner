/**
 * Root Stack Navigator
 *
 * Flow: ScanMRZ → ReadNFC → Result
 *
 * Data flows through the useIDVerificationNative zustand store.
 * Navigation params carry only lightweight identifiers; the heavy
 * payload (DocumentData, PassportNfcResult) lives in the store.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { PassportNfcResult } from '@hcs/id-scanner-native';

import { ConfigProvider, type AppConfig } from '../ConfigContext';
import { ScanMRZScreen } from '../screens/ScanMRZScreen';
import { ReadNFCScreen } from '../screens/ReadNFCScreen';
import { ResultScreen } from '../screens/ResultScreen';

export type RootStackParamList = {
  ScanMRZ: undefined;
  ReadNFC: undefined;
  Result: { nfcResult?: PassportNfcResult };
};

const Stack = createStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  config: AppConfig;
}

export function RootNavigator({ config }: RootNavigatorProps): React.ReactElement {
  return (
    <ConfigProvider value={config}>
      <Stack.Navigator
        initialRouteName="ScanMRZ"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#08111f' },
        }}
      >
        <Stack.Screen name="ScanMRZ" component={ScanMRZScreen} />
        <Stack.Screen name="ReadNFC" component={ReadNFCScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </ConfigProvider>
  );
}
