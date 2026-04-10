// Autenticazione dashboard tarature: sign/verify HMAC token per cookie sessione.
// Usa Web Crypto API per essere compatibile con l'Edge runtime del proxy.

export const AUTH_COOKIE_NAME = "gt-auth";
const TOKEN_TTL_DAYS = 30;

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  let padded = s.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + TOKEN_TTL_DAYS * 86400 };
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return false;
    const key = await getKey(secret);
    const sigBytes = base64urlDecode(sigB64);
    // Copia in un ArrayBuffer fresco per evitare il tipo SharedArrayBuffer
    const sigBuffer = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigBuffer).set(sigBytes);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return false;
    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
