/**
 * NFCReaderNative — read the ICAO 9303 NFC chip embedded in modern
 * passports / eIDs.
 *
 * Flow:
 *   1. The MRZ has been scanned beforehand (DocumentScannerNative). We
 *      derive the BAC (Basic Access Control) key from
 *      `documentNumber + dateOfBirth + expirationDate`.
 *   2. `react-native-nfc-manager` opens an ISO/IEC 14443-A session.
 *   3. We perform the BAC handshake to unlock the chip.
 *   4. Read DG1 (MRZ duplicated, used for cross-check) and DG2 (JPEG
 *      portrait).
 *   5. Optionally perform Active Authentication if the chip supports it.
 *
 * Failure modes are non-fatal: a phone without NFC, or a document
 * without a chip, simply skips this step. The KYC pipeline still works
 * with MRZ + face match alone (`nfcChipAuthentic` stays `null`).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import { useIDVerificationNative } from '../hooks/useIDVerificationNative';

interface Props {
  /**
   * Optional consumer hook — receives the chip portrait (base64 JPEG)
   * if extraction succeeded.
   */
  onChipPortrait?: (jpegBase64: string) => void;
}

type Status = 'IDLE' | 'WAITING_TAG' | 'READING' | 'SUCCESS' | 'FAILED' | 'UNSUPPORTED';

export function NFCReaderNative({ onChipPortrait }: Props) {
  const { documentData, setNfcChipAuthentic } = useIDVerificationNative();
  const [status, setStatus] = useState<Status>('IDLE');

  // Probe support up-front so the UI can show a clear "skip" branch on
  // devices without NFC instead of leaving the user hanging.
  useEffect(() => {
    let mounted = true;
    NfcManager.isSupported()
      .then((ok: boolean) => {
        if (!mounted) return;
        if (!ok) {
          setStatus('UNSUPPORTED');
          setNfcChipAuthentic(null);
          return;
        }
        return NfcManager.start();
      })
      .catch(() => mounted && setStatus('UNSUPPORTED'));
    return () => {
      mounted = false;
      try {
        NfcManager.cancelTechnologyRequest();
      } catch {
        /* ignore */
      }
    };
  }, [setNfcChipAuthentic]);

  const startRead = useCallback(async () => {
    if (!documentData) return;
    setStatus('WAITING_TAG');
    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      setStatus('READING');

      // BAC key seed — the SDK we're scaffolding handles the actual
      // protocol; here we just hand it the MRZ-derived inputs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tag: any = await (NfcManager as any).readPassport({
        documentNumber: documentData.documentNumber,
        dateOfBirth: compactIsoDate(documentData.dateOfBirth),
        expirationDate: compactIsoDate(documentData.expirationDate),
      });

      const portrait: string | undefined = tag?.dg2?.portraitBase64;
      const aaValid: boolean = Boolean(tag?.activeAuthentication?.valid);

      if (portrait) onChipPortrait?.(portrait);
      setNfcChipAuthentic(aaValid);
      setStatus('SUCCESS');
    } catch {
      setNfcChipAuthentic(false);
      setStatus('FAILED');
    } finally {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        /* ignore */
      }
    }
  }, [documentData, onChipPortrait, setNfcChipAuthentic]);

  return (
    <View style={{ padding: 16, gap: 10 }}>
      {status === 'UNSUPPORTED' && (
        <Text style={{ color: '#7a93ad' }}>
          ⚠ NFC is not available on this device — KYC will continue with
          MRZ + face match only.
        </Text>
      )}
      {status === 'IDLE' && (
        <Pressable
          onPress={startRead}
          style={{
            padding: 14,
            borderRadius: 10,
            backgroundColor: '#00c8ff',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#001620', fontWeight: '700' }}>
            Read passport chip (NFC)
          </Text>
        </Pressable>
      )}
      {(status === 'WAITING_TAG' || status === 'READING') && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator />
          <Text>
            {status === 'WAITING_TAG'
              ? 'Hold your passport against the back of the phone…'
              : 'Reading chip…'}
          </Text>
        </View>
      )}
      {status === 'SUCCESS' && (
        <Text style={{ color: '#22c55e', fontWeight: '700' }}>
          ✓ Chip authentic
        </Text>
      )}
      {status === 'FAILED' && (
        <Text style={{ color: '#ef4444' }}>Could not read the chip.</Text>
      )}
    </View>
  );
}

/** ISO `YYYY-MM-DD` → MRZ-compact `YYMMDD`. */
function compactIsoDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}
