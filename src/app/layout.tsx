import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AvaTech Tarature - Dashboard",
  description: "Sistema gestione tarature strumenti - AvaTech Tarature Certificazioni",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-50 p-6">
          {children}
        </main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
