import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth/use-auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OxSig - Verified Document Signing",
  description: "Private document storage with SHA-256 integrity checks and verified Ed25519 signatures.",
  applicationName: "OxSig",
  keywords: ["document signing", "Ed25519", "SHA-256", "private storage", "digital signatures"],
  authors: [{ name: "OxSig Team" }],
  robots: {
    index: true,
    follow: true
  },
  icons: { icon: "/favicon.ico" },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
              <Toaster richColors />
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
