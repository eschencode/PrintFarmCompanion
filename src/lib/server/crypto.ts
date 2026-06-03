// Secret-at-rest encryption for integration credentials (Shopify token, later
// printer access codes). AES-256-GCM via WebCrypto, key derived from the
// `ENCRYPTION_KEY` Worker secret. Server-only — never import from client code.
//
// Stored format:  v1:<base64(iv)>:<base64(ciphertext+tag)>
// The `v1:` prefix lets us detect encrypted vs. legacy plaintext values and
// rotate the scheme later without ambiguity.

const PREFIX = 'v1:';

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Derive a 256-bit AES key from the (high-entropy) secret string. SHA-256 is
// fine here because the input is a random Worker secret, not a user password.
async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  if (!secret) throw new Error('ENCRYPTION_KEY not set — cannot encrypt secret');
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${bytesToB64(iv)}:${bytesToB64(new Uint8Array(ct))}`;
}

// Returns plaintext. Passes through unencrypted (legacy) values unchanged so a
// row written before encryption existed still reads. Throws on a corrupt or
// undecryptable encrypted value (wrong/missing key) rather than silently failing.
export async function decryptSecret(stored: string, secret: string): Promise<string> {
  if (!isEncrypted(stored)) return stored;
  if (!secret) throw new Error('ENCRYPTION_KEY not set — cannot decrypt secret');
  const [, ivB64, ctB64] = stored.split(':');
  if (!ivB64 || !ctB64) throw new Error('Malformed encrypted secret');
  const key = await deriveKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ctB64)
  );
  return new TextDecoder().decode(pt);
}
