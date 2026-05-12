/**
 * DocumentScannerNative — VisionCamera-based MRZ scanner.
 *
 * Architecture:
 *   - `react-native-vision-camera`     captures frames
 *   - `vision-camera-mrz-scanner`      runs a frame processor that detects
 *                                      MRZ in real time on the GPU
 *   - On detection ⇒ auto-capture, send the cropped frame to your backend
 *     which calls `analyzeMRZ` from `@hcs/id-scanner-core`
 *
 * The component is intentionally a thin shell — it expects a host app
 * that provides:
 *   - camera permissions (`requestPermission()` from VisionCamera)
 *   - a backend endpoint reachable through `fetch()` to run the
 *     server-side MRZ pipeline (`@hcs/id-scanner-core` is Node-only:
 *     `image-js` and `mrz-detection` cannot run in the JS bundle).
 *
 * Live-detection style: a guide rectangle is overlaid; once the MRZ is
 * detected, the scanner auto-captures with no button press required.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — frame processor plugin, no public types yet.
import { useMRZScanner } from 'vision-camera-mrz-scanner';

import type { DocumentData } from '@hcs/id-scanner-core/types';

import { useIDVerificationNative } from '../hooks/useIDVerificationNative';

interface Props {
  /**
   * Backend endpoint that runs `analyzeMRZ` from `@hcs/id-scanner-core`
   * and returns the parsed `DocumentData`.
   */
  analyzeMrzEndpoint: string;
  /** Authorization header forwarded with the request. */
  authHeader?: string;
}

export function DocumentScannerNative({
  analyzeMrzEndpoint,
  authHeader,
}: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const { setDocumentData, setDocumentImageUri, setStep, setCurrentStep } =
    useIDVerificationNative();

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const onMrzDetected = useCallback(
    async (mrzImageBase64: string) => {
      if (busy) return;
      setBusy(true);
      setStep('document', 'PROCESSING');
      try {
        const res = await fetch(analyzeMrzEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authHeader ? { authorization: authHeader } : {}),
          },
          body: JSON.stringify({ imageBase64: mrzImageBase64 }),
        });
        if (!res.ok) throw new Error(`http_${res.status}`);
        const data = (await res.json()) as DocumentData;
        setDocumentData(data);
        setDocumentImageUri(`data:image/jpeg;base64,${mrzImageBase64}`);
        setStep('document', data.checkDigitsValid ? 'SUCCESS' : 'FAILED');
        setCurrentStep('NFC_PASSPORT');
      } catch {
        setStep('document', 'FAILED');
      } finally {
        setBusy(false);
      }
    },
    [
      analyzeMrzEndpoint,
      authHeader,
      busy,
      setCurrentStep,
      setDocumentData,
      setDocumentImageUri,
      setStep,
    ],
  );

  // VisionCamera frame processor — wired from the plugin.
  // The plugin exposes a hook that returns a frame processor + a callback
  // that fires when a stable MRZ is detected.
  const { frameProcessor } = useMRZScanner({
    onMRZRead: ({ imageBase64 }: { imageBase64: string }) => {
      void onMrzDetected(imageBase64);
    },
  });

  if (!device || !hasPermission) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
        <Text>Waiting for camera…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        style={{ flex: 1 }}
        device={device}
        isActive
        frameProcessor={frameProcessor}
      />
      {/* Guide rectangle is left to the host app to render on top — kept
          out of the lib so theming is fully customisable. */}
      {busy && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color="#00c8ff" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Reading MRZ…</Text>
        </View>
      )}
    </View>
  );
}
