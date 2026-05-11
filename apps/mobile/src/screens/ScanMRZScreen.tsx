/**
 * ScanMRZScreen - Step 1: Document MRZ Scanning
 *
 * Renders DocumentScannerNative full-screen.
 * When MRZ is detected the store transitions to NFC_PASSPORT —
 * we watch for that change and auto-navigate to ReadNFCScreen.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { DocumentScannerNative, useIDVerificationNative } from '@hcs/id-scanner-native';

import { useAppConfig } from '../ConfigContext';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = StackScreenProps<RootStackParamList, 'ScanMRZ'>;

export function ScanMRZScreen({ navigation }: Props): React.ReactElement {
  const { apiUrl, apiToken } = useAppConfig();
  const { currentStep, steps } = useIDVerificationNative();
  const [error, setError] = useState<string | null>(null);
  const hasNavigated = useRef(false);

  // Auto-navigate when MRZ detection succeeds and store moves to NFC step.
  useEffect(() => {
    if (currentStep === 'NFC_PASSPORT' && !hasNavigated.current) {
      hasNavigated.current = true;
      navigation.navigate('ReadNFC');
    }
  }, [currentStep, navigation]);

  // Show error when the document step fails.
  useEffect(() => {
    if (steps.document === 'FAILED') {
      setError('Impossible de lire le MRZ. Réessayez en cadrant bien le document.');
    }
    if (steps.document === 'PROCESSING' || steps.document === 'SUCCESS') {
      setError(null);
    }
  }, [steps.document]);

  const analyzeMrzEndpoint = `${apiUrl.replace(/\/$/, '')}/api/analyze-mrz`;
  const authHeader = apiToken ? `Bearer ${apiToken}` : undefined;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scanner votre document</Text>
        <Text style={styles.headerSubtitle}>
          Cadrez la bande MRZ (bas du document) dans le rectangle
        </Text>
      </View>

      {/* Camera / Scanner */}
      <View style={styles.scanner}>
        <DocumentScannerNative
          analyzeMrzEndpoint={analyzeMrzEndpoint}
          authHeader={authHeader}
        />
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              hasNavigated.current = false;
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08111f',
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#08111f',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#7a93ad',
    fontSize: 14,
    marginTop: 6,
  },
  scanner: {
    flex: 1,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
