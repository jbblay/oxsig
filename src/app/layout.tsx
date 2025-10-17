import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app/AppShell";
import PWARegister from "@/components/app/PWARegister";
import AnimatedBackground from "@/components/app/AnimatedBackground";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OxSig - Quantum-Safe Secure Communications",
  description: "Post-quantum secure communications platform with self-sovereign identity, zero-knowledge proofs, and AI security co-pilot.",
  manifest: "/manifest.webmanifest",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OxSig",
  },
  applicationName: "OxSig",
  keywords: ["secure communications", "quantum-safe", "E2EE", "decentralized identity", "zero-knowledge", "privacy"],
  authors: [{ name: "OxSig Team" }],
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    viewportFit: "cover"
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ThemeProvider>
          <AnimatedBackground />
          <PWARegister />
          <AppShell>{children}</AppShell>
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}