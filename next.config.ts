import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // identificativo della build: le pagine aperte sugli iMac lo confrontano con quello del server e si ricaricano da sole
  env: { NEXT_PUBLIC_BUILD_ID: String(Date.now()) },
  // la cartella padre ha un altro package-lock: la radice del progetto è QUESTA cartella
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
