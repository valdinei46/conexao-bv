const SALT_TEXT = 'ConexaoBV-BoaVista-RR-E2E-v1';

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase || 'conexaobv-padrao'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT_TEXT),
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptMessageText(plainText: string, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuffer)),
  });
}

export async function decryptMessageText(payload: string, passphrase: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(payload) as { v?: number; iv?: string; ct?: string };
    if (!parsed.iv || !parsed.ct) return null;
    const key = await deriveKey(passphrase);
    const iv = fromBase64(parsed.iv);
    const ct = fromBase64(parsed.ct);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return null;
  }
}
