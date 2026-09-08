import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import '@xterm/xterm/css/xterm.css';
import '@xyflow/react/dist/style.css';
import './globals.css';
import './oxsig-design.css';
import './compact-console.css';
import './lab-flow.css';
import './workspace-mode.css';
import AppShell from '@/components/app/AppShell';
import GuestAuthGate from '@/components/auth/guest-auth-gate';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth/use-auth';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Oxsig — Technical workspace',
  description: 'Collaborate, practice, run cloud labs, and capture technical evidence in one workspace.',
  applicationName: 'Oxsig',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} dynamic>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.className} min-h-screen`}>
          <ThemeProvider>
            <AuthProvider>
              <GuestAuthGate>
                <AppShell>{children}</AppShell>
                <Toaster richColors />
              </GuestAuthGate>
            </AuthProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
