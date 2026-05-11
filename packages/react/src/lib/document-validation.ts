import type { DocumentData } from '@hcs/id-scanner-core';

export function isDocumentUsableForSelfie(
  documentData: DocumentData | null | undefined,
): boolean {
  if (!documentData) return false;

  const status = String(
    (documentData as DocumentData & { status?: unknown }).status ?? '',
  ).toUpperCase();

  if (status === 'VALID') return true;
  if (status === 'PARTIAL') return true;

  if ((documentData as DocumentData & { isValid?: unknown }).isValid === true) {
    return true;
  }
  if ((documentData as DocumentData & { isPartial?: unknown }).isPartial === true) {
    return true;
  }

  const hasIdentity =
    Boolean(documentData.firstName) &&
    Boolean(documentData.lastName) &&
    Boolean(documentData.dateOfBirth);

  const hasDocument =
    Boolean(documentData.documentNumber) || Boolean(documentData.documentType);

  return hasIdentity && hasDocument;
}
