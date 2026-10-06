import { snapshotSchema } from '../../shared/schema';
import type { Snapshot } from '../../shared/schema';
import { Role } from '../../shared/enums';

const OFFLINE_ACCOUNT_PREFIX = 'revora:offline-account:';
const KEY_DERIVATION_ITERATIONS = 310_000;
const MINIMUM_PASSPHRASE_LENGTH = 12;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

interface EncryptedAccount {
  organizationId: string;
  userId: string;
  label: string;
  salt: string;
  iv: string;
  ciphertext: string;
  savedAt: string;
}

let activeKey: CryptoKey | null = null;
let activeAccountKey: string | null = null;

function accountKey(organizationId: string, userId: string): string {
  return `${OFFLINE_ACCOUNT_PREFIX}${organizationId}:${userId}`;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {text += String.fromCharCode(byte);}

  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {bytes[index] = binary.charCodeAt(index);}

  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KEY_DERIVATION_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function readAccount(key: string): EncryptedAccount | null {
  try {
    const value = localStorage.getItem(key);

    return value ? (JSON.parse(value) as EncryptedAccount) : null;
  } catch {
    return null;
  }
}

export function offlineAccounts(): { key: string; label: string; savedAt: string }[] {
  const accounts: { key: string; label: string; savedAt: string }[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(OFFLINE_ACCOUNT_PREFIX)) {continue;}
    const account = readAccount(key);
    if (account) {accounts.push({ key, label: account.label, savedAt: account.savedAt });}
  }

  return accounts;
}

export function hasOfflineAccount(snapshot: Snapshot): boolean {
  return Boolean(
    readAccount(accountKey(snapshot.session.organizationId, snapshot.session.user.id)),
  );
}

export async function enableOfflineAccount(snapshot: Snapshot, passphrase: string): Promise<void> {
  if (snapshot.session.user.role !== Role.Sales)
    {throw new Error('Offline account access is available to Sales staff.');}
  if (passphrase.length < MINIMUM_PASSPHRASE_LENGTH)
    {throw new Error('Use an offline passphrase of at least 12 characters.');}
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(passphrase, salt);
  const storageKey = accountKey(snapshot.session.organizationId, snapshot.session.user.id);
  activeKey = key;
  activeAccountKey = storageKey;
  await writeSnapshot(snapshot, key, storageKey, salt);
}

async function writeSnapshot(
  snapshot: Snapshot,
  key: CryptoKey,
  storageKey: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  const record: EncryptedAccount = {
    organizationId: snapshot.session.organizationId,
    userId: snapshot.session.user.id,
    label: `${snapshot.session.user.name} · ${snapshot.workspace.organization.name}`,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey, JSON.stringify(record));
}

export async function refreshOfflineAccount(snapshot: Snapshot): Promise<void> {
  const storageKey = accountKey(snapshot.session.organizationId, snapshot.session.user.id);
  if (!activeKey || storageKey !== activeAccountKey) {return;}
  const current = readAccount(storageKey);
  if (current) {await writeSnapshot(snapshot, activeKey, storageKey, fromBase64(current.salt));}
}

export async function unlockOfflineAccount(
  storageKey: string,
  passphrase: string,
): Promise<Snapshot> {
  const record = readAccount(storageKey);
  if (!record || !storageKey.startsWith(OFFLINE_ACCOUNT_PREFIX))
    {throw new Error('Offline account is unavailable.');}
  try {
    const salt = fromBase64(record.salt);
    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      key,
      fromBase64(record.ciphertext),
    );
    const snapshot = snapshotSchema.parse(JSON.parse(new TextDecoder().decode(decrypted)));
    if (
      snapshot.session.user.role !== Role.Sales ||
      snapshot.session.organizationId !== record.organizationId ||
      snapshot.session.user.id !== record.userId
    )
      {throw new Error('Offline account does not match its owner.');}
    activeKey = key;
    activeAccountKey = storageKey;

    return snapshot;
  } catch {
    throw new Error('Could not unlock this offline account. Check the passphrase.');
  }
}

export function disableOfflineAccount(snapshot: Snapshot): void {
  const storageKey = accountKey(snapshot.session.organizationId, snapshot.session.user.id);
  localStorage.removeItem(storageKey);
  if (activeAccountKey === storageKey) {
    activeKey = null;
    activeAccountKey = null;
  }
}

export function clearOfflineKey(): void {
  activeKey = null;
  activeAccountKey = null;
}
