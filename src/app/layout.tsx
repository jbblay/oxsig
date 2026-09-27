import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import '@xterm/xterm/css/xterm.css';
import '@xyflow/react/dist/style.css';
import './globals.css';
import './oxsig-design.css';
import './compact-console.css';
import './workspace-enhancements.css';
import './lab-flow.css';
import './workspace-mode.css';
import './workspace-personalities.css';
import './readability.css';
import AppShell from '@/components/app/AppShell';
import GuestAuthGate from '@/components/auth/guest-auth-gate';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { isE2EAuthEnabled } from '@/lib/auth/e2e-auth';
import { AuthProvider, E2EAuthProvider } from '@/lib/auth/use-auth';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OXSIG — Launch. Operate. Prove.',
  description: 'Learn infrastructure by operating real technical environments with AI assistance, team collaboration and evidence-backed progress.',
  applicationName: 'OXSIG',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/oxsig-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/oxsig-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'OXSIG' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c5261',
};

function AppDocument({ children, e2eAuth }: { children: React.ReactNode; e2eAuth: boolean }) {
  const content = (
    <GuestAuthGate>
      <AppShell>{children}</AppShell>
      <Toaster richColors />
    </GuestAuthGate>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen`}>
        <ThemeProvider>
          {e2eAuth ? <E2EAuthProvider>{content}</E2EAuthProvider> : <AuthProvider>{content}</AuthProvider>}
        </ThemeProvider>
      </body>
    </html>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const e2eAuth = isE2EAuthEnabled();
  const document = <AppDocument e2eAuth={e2eAuth}>{children}</AppDocument>;

  if (e2eAuth) return document;

  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} dynamic>
      {document}
    </ClerkProvider>
  );
}
