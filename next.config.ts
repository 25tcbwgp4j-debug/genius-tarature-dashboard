import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // identificativo della build: le pagine aperte sugli iMac lo confrontano con quello del server e si ricaricano da sole
  env: { NEXT_PUBLIC_BUILD_ID: String(Date.now()) },
  // la cartella padre ha un altro package-lock: la radice del progetto è QUESTA cartella
  turbopack: { root: path.resolve(__dirname) },
  // 25/10/2026 (audit sicurezza): la dashboard non si può incorniciare in altri siti (clickjacking), niente plugin,
  // niente <base> o moduli verso altri domini, niente Referer con token, niente sniffing dei tipi.
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
