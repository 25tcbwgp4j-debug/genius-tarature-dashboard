import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // la cartella padre ha un altro package-lock: la radice del progetto è QUESTA cartella
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
