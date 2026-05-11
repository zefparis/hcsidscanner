export type PassportNfcErrorCode =
  | 'NFC_NOT_SUPPORTED'
  | 'NFC_DISABLED'
  | 'NFC_CANCELLED'
  | 'PASSPORT_NOT_DETECTED'
  | 'BAC_FAILED'
  | 'PACE_FAILED'
  | 'DG_READ_FAILED'
  | 'PASSIVE_AUTH_FAILED';

export class PassportNfcError extends Error {
  constructor(
    public readonly code: PassportNfcErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'PassportNfcError';
  }
}
