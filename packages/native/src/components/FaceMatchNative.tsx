/**
 * FaceMatchNative — selfie capture + backend-proxied Rekognition call.
 *
 * Like the web version, the actual Rekognition call lives server-side
 * (`@hcs/id-scanner-core/compareFaces`); this component only:
 *   1. Captures a selfie via VisionCamera (front camera).
 *   2. POSTs both base64 images to the backend.
 *   3. Drives the zustand store with the result.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import { useIDVerificationNative } from '../hooks/useIDVerificationNative';
import type { FaceMatchResult } from '@hcs/id-scanner-core';

interface Props {
  faceMatchEndpoint: string;
  authHeader?: string;
  /** Min similarity to consider a positive match (default 80). */
  threshold?: number;
}

export function FaceMatchNative({
  faceMatchEndpoint,
  authHeader,
  threshold = 80,
}: Props) {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();

  // Real type is Camera from react-native-vision-camera, but the package
  // is declared as ambient `any` here so the ref is loose-typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cameraRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    documentImageUri,
    selfieUri,
    setSelfieUri,
    faceMatchResult,
    setFaceMatchResult,
    setStep,
    setCurrentStep,
  } = useIDVerificationNative();

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const onCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    setError(null);
    setStep('faceMatch', 'PROCESSING');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photo: any = await (cameraRef.current as any).takePhoto({
        flash: 'off',
        quality: 90,
      });
      const uri = `file://${photo.path}`;
      setSelfieUri(uri);

      // We expect the backend to read both files (or to proxy them as
      // base64) — here we hand it the URIs, the host app can adapt.
      const res = await fetch(faceMatchEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authHeader ? { authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          sourceImageUri: uri,
          targetImageUri: documentImageUri,
          threshold,
        }),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as FaceMatchResult;
      setFaceMatchResult(data);
      if (data.isMatch) {
        setStep('faceMatch', 'SUCCESS');
      } else {
        setStep('faceMatch', 'FAILED');
        setError(`No match — similarity ${data.similarity.toFixed(1)}%`);
      }
    } catch (err) {
      setStep('faceMatch', 'FAILED');
      setError((err as Error).message ?? 'face_match_failed');
    } finally {
      setBusy(false);
    }
  }, [
    authHeader,
    documentImageUri,
    faceMatchEndpoint,
    setFaceMatchResult,
    setSelfieUri,
    setStep,
    threshold,
  ]);

  if (!device || !hasPermission) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
        <Text>Waiting for front camera…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={device}
        photo
        isActive={!busy}
      />
      <View style={{ padding: 16, gap: 10, backgroundColor: '#0b1722' }}>
        {error && <Text style={{ color: '#ef4444' }}>{error}</Text>}
        {faceMatchResult?.isMatch ? (
          <Pressable
            onPress={() => setCurrentStep('RESULT')}
            style={btnPrimary}
          >
            <Text style={btnText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onCapture}
            disabled={busy}
            style={[btnPrimary, busy && { opacity: 0.6 }]}
          >
            <Text style={btnText}>
              {selfieUri ? 'Retake selfie' : 'Take selfie'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const btnPrimary = {
  padding: 14,
  borderRadius: 10,
  backgroundColor: '#00c8ff',
  alignItems: 'center' as const,
};

const btnText = {
  color: '#001620',
  fontWeight: '700' as const,
};
