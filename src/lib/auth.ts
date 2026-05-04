// Auth dashboard Tarature: verifica JWT HS256 emesso dal backend FastAPI.
// Il secret AUTH_JWT_SECRET deve essere identico fra backend Railway e frontend Vercel.
// Il cookie httpOnly "gt-auth" contiene il JWT (3 parti header.payload.sig in base64url).
//
// Sostituisce il vecchio token HMAC-only custom: ora ogni token e' associato a uno
// specifico utente (sub/email/role) e cosi' la dashboard puo' mostrare il nome
// dell'utente loggato + nascondere features in base al ruolo.

export const AUTH_COOKIE_NAME = "gt-auth";

export type UserRole = "admin" | "operator";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  full_name?: string | null;
  iat: number;
  exp: number;
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
    ["verify"],
  );
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const key = await getKey(secret);
    const sigBytes = base64urlDecode(sigB64);
    const sigBuffer = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigBuffer).set(sigBytes);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;
    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as JwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== "admin" && payload.role !== "operator") return null;
    return payload;
  } catch {
    return null;
  }
}

// Ritrocompat: il vecchio token HMAC custom (signToken/verifyToken pre-v2026-05-04)
// non e' piu' valido. Chi ha un cookie vecchio viene ridiretto al login.
export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const payload = await verifyJwt(token, secret);
  return payload !== null;
}
