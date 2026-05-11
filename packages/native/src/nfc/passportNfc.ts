import type { DocumentData } from '@hcs/id-scanner-core';
import { NativeModules } from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import { PassportNfcError } from './errors';
import type {
  EmrtdBridge,
  PassportNfcAccessKeys,
  PassportNfcDataGroups,
  PassportNfcReaderOptions,
  PassportNfcResult,
} from './types';

function compactIsoDate(value: string): string {
  return value.replaceAll('-', '').slice(2);
}

export function derivePassportAccessKeys(
  documentData: DocumentData,
): PassportNfcAccessKeys {
  return {
    documentNumber: documentData.documentNumber,
    dateOfBirth: compactIsoDate(documentData.dateOfBirth),
    expirationDate: compactIsoDate(documentData.expirationDate),
  };
}

function assertMrzAccessKeys(keys: PassportNfcAccessKeys): void {
  if (!keys.documentNumber || !keys.dateOfBirth || !keys.expirationDate) {
    throw new PassportNfcError('BAC_FAILED', 'MRZ access keys are incomplete.');
  }
}

function getBridge(): EmrtdBridge | null {
  const nativeModule = NativeModules.HcsPassportNfc as
    | {
        readPassport?: (
          documentNumber: string,
          dateOfBirthYYMMDD: string,
          expirationDateYYMMDD: string,
        ) => Promise<PassportNfcDataGroups>;
      }
    | undefined;
  if (typeof nativeModule?.readPassport === 'function') {
    return {
      readPassport: (keys) =>
        nativeModule.readPassport!(
          keys.documentNumber,
          keys.dateOfBirth,
          keys.expirationDate,
        ),
    };
  }

  const nfcManagerCandidate = NfcManager as unknown as {
    readPassport?: EmrtdBridge['readPassport'];
  };
  if (typeof nfcManagerCandidate.readPassport !== 'function') return null;
  return { readPassport: nfcManagerCandidate.readPassport.bind(NfcManager) };
}

function doesChipMrzMatchDocument(
  dataGroups: PassportNfcDataGroups,
  documentData: DocumentData,
): boolean {
  const dg1 = dataGroups.dg1 as { documentNumber?: unknown } | undefined;
  if (!dg1?.documentNumber) return false;
  return String(dg1.documentNumber).replaceAll('<', '').trim() === documentData.documentNumber;
}

export async function readPassportNfc({
  documentData,
}: PassportNfcReaderOptions): Promise<PassportNfcResult> {
  const supported = await NfcManager.isSupported();
  if (!supported) throw new PassportNfcError('NFC_NOT_SUPPORTED');

  const enabled = await NfcManager.isEnabled();
  if (!enabled) throw new PassportNfcError('NFC_DISABLED');

  const keys = derivePassportAccessKeys(documentData);
  assertMrzAccessKeys(keys);

  const bridge = getBridge();
  if (!bridge) {
    throw new PassportNfcError(
      'NFC_NOT_SUPPORTED',
      'Native Android eMRTD bridge is not available.',
    );
  }

  try {
    const dataGroups = await bridge.readPassport(keys);
    const chipMrzMatchesScannedMrz = doesChipMrzMatchDocument(dataGroups, documentData);

    return {
      success: true,
      ...dataGroups,
      chipMrzMatchesScannedMrz,
      passiveAuthenticationPassed: undefined,
      warnings: chipMrzMatchesScannedMrz
        ? []
        : ['DG1 does not match the scanned MRZ document number.'],
    };
  } catch (err) {
    if (err instanceof PassportNfcError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('cancel')) {
      throw new PassportNfcError('NFC_CANCELLED', message);
    }
    throw new PassportNfcError('DG_READ_FAILED', message);
  }
}
