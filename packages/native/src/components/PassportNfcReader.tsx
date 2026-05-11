import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PassportNfcError, readPassportNfc, type PassportNfcResult } from '../nfc';
import { useIDVerificationNative } from '../hooks/useIDVerificationNative';

type ReaderState = 'IDLE' | 'SCANNING' | 'SUCCESS' | 'ERROR' | 'SKIPPED';

interface PassportNfcReaderProps {
  optional?: boolean;
  onComplete?: (result: PassportNfcResult) => void;
  onSkip?: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof PassportNfcError) {
    if (err.code === 'NFC_NOT_SUPPORTED') return 'NFC is not supported on this phone.';
    if (err.code === 'NFC_DISABLED') return 'NFC is disabled. Enable NFC and try again.';
    if (err.code === 'NFC_CANCELLED') return 'NFC reading was cancelled.';
    if (err.code === 'BAC_FAILED') return 'Could not unlock the passport chip from MRZ data.';
    if (err.code === 'DG_READ_FAILED') return 'Could not read passport chip data groups.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Could not read the passport chip.';
}

export function PassportNfcReader({
  optional = true,
  onComplete,
  onSkip,
}: PassportNfcReaderProps) {
  const {
    documentData,
    setNfcChipAuthentic,
    setPassportNfcResult,
    setStep,
    setCurrentStep,
  } = useIDVerificationNative();
  const [state, setState] = useState<ReaderState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PassportNfcResult | null>(null);

  const continueToFaceMatch = useCallback(() => {
    setCurrentStep('FACE_MATCH');
  }, [setCurrentStep]);

  const skip = useCallback(() => {
    setState('SKIPPED');
    setNfcChipAuthentic(null);
    setStep('nfcPassport', 'PENDING');
    onSkip?.();
    continueToFaceMatch();
  }, [continueToFaceMatch, onSkip, setNfcChipAuthentic, setStep]);

  const readChip = useCallback(async () => {
    if (!documentData) return;
    setState('SCANNING');
    setStep('nfcPassport', 'PROCESSING');
    setError(null);

    try {
      const nfcResult = await readPassportNfc({ documentData });
      setResult(nfcResult);
      setPassportNfcResult(nfcResult);
      setNfcChipAuthentic(nfcResult.passiveAuthenticationPassed ?? nfcResult.success);
      setStep('nfcPassport', nfcResult.success ? 'SUCCESS' : 'FAILED');
      setState('SUCCESS');
      onComplete?.(nfcResult);
    } catch (err) {
      setNfcChipAuthentic(false);
      setStep('nfcPassport', 'FAILED');
      setError(errorMessage(err));
      setState('ERROR');
    }
  }, [documentData, onComplete, setNfcChipAuthentic, setPassportNfcResult, setStep]);

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Read passport chip</Text>
      <Text style={{ color: '#7a93ad', lineHeight: 20 }}>
        Place the top of your phone on the passport chip. Keep the passport still until the scan completes.
      </Text>

      {state === 'SCANNING' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator />
          <Text>Reading NFC chip…</Text>
        </View>
      )}

      {state === 'SUCCESS' && result && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: '#22c55e', fontWeight: '700' }}>Passport chip read successfully.</Text>
          <Text>DG1 match: {result.chipMrzMatchesScannedMrz ? 'yes' : 'no'}</Text>
          <Text>DG2 face image: {result.dg2FaceImageBase64 ? 'available' : 'not available'}</Text>
          <Text>Passive authentication: {result.passiveAuthenticationPassed === undefined ? 'not verified' : result.passiveAuthenticationPassed ? 'passed' : 'failed'}</Text>
          {result.warnings.map((warning) => (
            <Text key={warning} style={{ color: '#f59e0b' }}>{warning}</Text>
          ))}
        </View>
      )}

      {state === 'ERROR' && error && (
        <Text style={{ color: '#ef4444' }}>{error}</Text>
      )}

      <View style={{ gap: 10 }}>
        {state !== 'SCANNING' && state !== 'SUCCESS' && (
          <Pressable onPress={readChip} style={{ padding: 14, borderRadius: 10, backgroundColor: '#00c8ff', alignItems: 'center' }}>
            <Text style={{ color: '#001620', fontWeight: '700' }}>Start NFC scan</Text>
          </Pressable>
        )}
        {state === 'SUCCESS' && (
          <Pressable onPress={continueToFaceMatch} style={{ padding: 14, borderRadius: 10, backgroundColor: '#00c8ff', alignItems: 'center' }}>
            <Text style={{ color: '#001620', fontWeight: '700' }}>Continue to selfie</Text>
          </Pressable>
        )}
        {state === 'ERROR' && (
          <Pressable onPress={readChip} style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#7a93ad', alignItems: 'center' }}>
            <Text>Retry NFC scan</Text>
          </Pressable>
        )}
        {optional && state !== 'SCANNING' && (
          <Pressable onPress={skip} style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#7a93ad', alignItems: 'center' }}>
            <Text>Skip NFC</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
