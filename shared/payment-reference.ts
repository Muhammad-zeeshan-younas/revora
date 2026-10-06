const REFERENCE_KEY_SEPARATOR = '\u0000';

export function paymentReferenceKey(bank: string, reference: string): string {
  return `${bank}${REFERENCE_KEY_SEPARATOR}${reference.toLowerCase()}`;
}
