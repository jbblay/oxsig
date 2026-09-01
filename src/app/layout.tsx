import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/app/AppShell";
import PWARegister from "@/components/app/PWARegister";
import BackgroundController from "@/components/app/BackgroundController";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
import { AuthProvider } from "@/lib/auth/use-auth";

const inter = Inter({ subsets: ["latin"] });

// A fresh CSP nonce is attached by middleware for every request. Dynamic
// rendering lets Next.js apply that nonce to its bootstrap scripts instead of
// serving build-time HTML whose inline scripts would be blocked by the CSP.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OxSig - Quantum-Safe Secure Communications",
  description: "Post-quantum secure communications platform with self-sovereign identity, zero-knowledge proofs, and AI security co-pilot.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OxSig",
  },
  applicationName: "OxSig",
  keywords: ["secure communications", "quantum-safe", "E2EE", "decentralized identity", "zero-knowledge", "privacy"],
  authors: [{ name: "OxSig Team" }],
  robots: {
    index: true,
    follow: true
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ErrorBoundary>
          <ThemeProvider nonce={nonce}>
            <AuthProvider>
              <PerformanceMonitor />
              <BackgroundController />
              <PWARegister />
              <AppShell>{children}</AppShell>
              <Toaster richColors />
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
