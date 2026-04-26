/**
 * IDVerificationFlowNative — single drop-in component that wraps the
 * 3-step KYC pipeline for React Native.
 *
 * ```tsx
 * import { IDVerificationFlowNative } from '@hcs/id-scanner-native';
 *
 * <IDVerificationFlowNative
 *   config={{ tenantId, minFaceMatchScore: 80 }}
 *   endpoints={{
 *     analyzeMrz: 'https://api.example.com/api/analyze-mrz',
 *     faceMatch:  'https://api.example.com/api/face-match',
 *   }}
 *   onComplete={(r) => navigation.replace('Onboarding', { kyc: r })}
 *   onError={(c) => Alert.alert('KYC failed', c)}
 * />
 * ```
 */

import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  computeKycScore,
  type IDScannerConfig,
  type IDVerificationResult,
} from '@hcs/id-scanner-core';

import { DocumentScannerNative } from './DocumentScannerNative';
import { FaceMatchNative } from './FaceMatchNative';
import { NFCReaderNative } from './NFCReaderNative';
import { useIDVerificationNative } from '../hooks/useIDVerificationNative';

export interface IDVerificationFlowNativeProps {
  config: IDScannerConfig;
  endpoints: {
    /** Backend that runs `analyzeMRZ` from `@hcs/id-scanner-core`. */
    analyzeMrz: string;
    /** Backend that runs `compareFaces` from `@hcs/id-scanner-core`. */
    faceMatch: string;
  };
  authHeader?: string;
  /** Whether to also try reading the NFC chip after the MRZ. Default true. */
  enableNfc?: boolean;
  onComplete?: (result: IDVerificationResult) => void;
  onError?: (code: string) => void;
}

export function IDVerificationFlowNative({
  config,
  endpoints,
  authHeader,
  enableNfc = true,
  onComplete,
  onError,
}: IDVerificationFlowNativeProps) {
  const {
    currentStep,
    documentData,
    faceMatchResult,
    nfcChipAuthentic,
    errorMessage,
    kycScore,
  } = useIDVerificationNative();

  useEffect(() => {
    if (errorMessage) onError?.(errorMessage);
  }, [errorMessage, onError]);

  useEffect(() => {
    if (currentStep !== 'RESULT' || !documentData) return;
    const score =
      kycScore ??
      computeKycScore({
        mrzValid: documentData.checkDigitsValid,
        documentExpired: documentData.isExpired,
        faceSimilarity: faceMatchResult?.similarity,
      });
    const result: IDVerificationResult = {
      documentData,
      faceMatch: faceMatchResult ?? undefined,
      kycScore: score,
      timestamp: new Date().toISOString(),
      tenantId: config.tenantId,
      employeeId: config.employeeId,
    };
    onComplete?.(result);
  }, [
    currentStep,
    documentData,
    faceMatchResult,
    kycScore,
    config.tenantId,
    config.employeeId,
    onComplete,
  ]);

  const screen = useMemo(() => {
    if (currentStep === 'DOCUMENT') {
      return (
        <DocumentScannerNative
          analyzeMrzEndpoint={endpoints.analyzeMrz}
          authHeader={authHeader}
        />
      );
    }
    if (currentStep === 'FACE_MATCH' && config.requireFaceMatch !== false) {
      return (
        <View style={{ flex: 1 }}>
          {enableNfc && documentData && (
            <NFCReaderNative />
          )}
          <FaceMatchNative
            faceMatchEndpoint={endpoints.faceMatch}
            authHeader={authHeader}
            threshold={config.minFaceMatchScore}
          />
        </View>
      );
    }
    return (
      <View style={{ padding: 16, gap: 6 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>KYC verdict</Text>
        <Text>Score: {kycScore ?? '—'} / 1.0</Text>
        {nfcChipAuthentic !== null && (
          <Text>
            NFC chip: {nfcChipAuthentic ? '✓ authentic' : '✕ unverified'}
          </Text>
        )}
      </View>
    );
  }, [
    authHeader,
    config.minFaceMatchScore,
    config.requireFaceMatch,
    currentStep,
    documentData,
    enableNfc,
    endpoints.analyzeMrz,
    endpoints.faceMatch,
    kycScore,
    nfcChipAuthentic,
  ]);

  return <View style={{ flex: 1 }}>{screen}</View>;
}
