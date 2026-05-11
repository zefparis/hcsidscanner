/**
 * ReadNFCScreen - Step 2: NFC Chip Reading
 *
 * Renders PassportNfcReader which reads documentData from the
 * zustand store (set by ScanMRZScreen) to derive BAC keys.
 * On success → navigates to ResultScreen with the NFC result.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import {
  PassportNfcReader,
  useIDVerificationNative,
  type PassportNfcResult,
} from '@hcs/id-scanner-native';

import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = StackScreenProps<RootStackParamList, 'ReadNFC'>;

export function ReadNFCScreen({ navigation }: Props): React.ReactElement {
  const { documentData } = useIDVerificationNative();
  const [error, setError] = useState<string | null>(null);

  const onComplete = useCallback(
    (result: PassportNfcResult) => {
      setError(null);
      navigation.navigate('Result', { nfcResult: result });
    },
    [navigation],
  );

  // If somehow we land here without documentData, go back.
  if (!documentData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.errorText}>
            Aucune donnée MRZ disponible. Veuillez rescanner le document.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Retour au scan</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Lecture de la puce NFC</Text>
        <Text style={styles.instruction}>
          Posez le dos de votre téléphone sur la page photo du document
        </Text>
        <Text style={styles.subInstruction}>
          Ne bougez pas pendant la lecture (5-10 secondes)
        </Text>
      </View>

      {/* NFC Reader */}
      <View style={styles.reader}>
        <PassportNfcReader
          optional={false}
          onComplete={onComplete}
        />
      </View>

      {/* Error overlay */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
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
  },
  backButton: {
    marginBottom: 12,
  },
  backText: {
    color: '#00c8ff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  instruction: {
    color: '#7a93ad',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  subInstruction: {
    color: '#5a7a96',
    fontSize: 13,
    marginTop: 4,
  },
  reader: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#00c8ff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#001620',
    fontWeight: '700',
    fontSize: 15,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    textAlign: 'center',
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
  },
  errorBannerText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
});
