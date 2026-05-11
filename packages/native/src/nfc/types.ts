import type { DocumentData } from '@hcs/id-scanner-core';

export interface PassportNfcAccessKeys {
  documentNumber: string;
  dateOfBirth: string;
  expirationDate: string;
}

export interface PassportNfcDataGroups {
  dg1?: unknown;
  dg2FaceImageBase64?: string;
  sod?: unknown;
  com?: unknown;
}

export interface PassportNfcResult extends PassportNfcDataGroups {
  success: boolean;
  chipMrzMatchesScannedMrz: boolean;
  passiveAuthenticationPassed?: boolean;
  warnings: string[];
}

export interface PassportNfcReaderOptions {
  documentData: DocumentData;
  passiveAuthenticationCertificates?: unknown[];
}

export interface EmrtdBridge {
  readPassport: (keys: PassportNfcAccessKeys) => Promise<PassportNfcDataGroups>;
}
