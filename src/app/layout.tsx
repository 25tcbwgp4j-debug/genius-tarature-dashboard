import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AvaTech Tarature - Dashboard",
  description: "Sistema gestione tarature strumenti - AvaTech Tarature Certificazioni",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tarature",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/apple-touch-icon-167.png", sizes: "167x167" },
      { url: "/apple-touch-icon-152.png", sizes: "152x152" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex bg-gray-50 dark:bg-gray-950">
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-3 sm:p-6 pt-14 sm:pt-6 lg:pt-6">
            {children}
          </main>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
        <Script id="sw-register" strategy="afterInteractive">
          {SW_REGISTER}
        </Script>
      </body>
    </html>
  );
}
