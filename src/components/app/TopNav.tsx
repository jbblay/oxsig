"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Apple,
  Network,
  Download,
  FileCheck,
  HardDrive,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Presentation,
  Settings,
  Shield,
  Smartphone,
  Sun,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/use-auth";

interface TopNavProps {
  onMenuClick?: () => void;
}

export default function TopNav({ onMenuClick: _onMenuClick }: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const navLinks = [
    { label: "Storage", href: "/storage", icon: HardDrive },
    { label: "Vault", href: "/vault", icon: Lock },
    { label: "Security", href: "/security", icon: Shield },
    { label: "Audit", href: "/audit", icon: FileCheck },
    { label: "Rooms", href: "/collab", icon: Users },
    { label: "Boards", href: "/collab/storyboards", icon: Presentation },
    { label: "Cyber Lab", href: "/labs", icon: Network },
  ];

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-20%,hsl(var(--primary)/0.06),transparent_60%)]" />
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-6 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <SidebarTrigger className="transition-transform hover:scale-[1.04] active:scale-[0.98]" />
            <Link href="/home" className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span className="font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
                OxSig
              </span>
            </Link>
          </div>
          <nav className="hidden xl:flex items-center space-x-5 text-sm font-medium">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-foreground/80 flex items-center gap-1.5",
                  pathname === link.href || pathname?.startsWith(link.href + "/")
                    ? "text-foreground"
                    : "text-foreground/60"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hidden md:flex items-center gap-2 transition-all hover:bg-primary/10"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Download OxSig</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => {
                  toast.success("Downloading OxSig for Windows...");
                  window.open('https://github.com/jbblay/oxsig/releases/download/v0.1.0/oxsig_0.1.0_x64-setup.exe', '_blank');
                }}
                className="cursor-pointer"
              >
                <Monitor className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span className="font-medium">Windows</span>
                  <span className="text-xs text-muted-foreground">v0.1.0 • Windows 10/11 (64-bit)</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  toast.info("macOS version coming soon!");
                }}
                className="cursor-pointer opacity-60"
              >
                <Apple className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span className="font-medium">macOS</span>
                  <span className="text-xs text-muted-foreground">Coming Soon • macOS 11+ (Universal)</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  toast.info("Android version coming soon!");
                }}
                className="cursor-pointer opacity-60"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span className="font-medium">Android</span>
                  <span className="text-xs text-muted-foreground">Coming Soon • Android 8.0+ (.apk)</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/features" className="flex items-center">
                  <Shield className="w-4 h-4 mr-2" />
                  <span className="text-sm">View all features</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="transition-colors hover:bg-primary/10"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="transition-colors hover:bg-primary/10">
                <User className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{isAuthenticated ? user?.displayName || user?.email || 'My Account' : 'Guest session'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAuthenticated ? <>
                <DropdownMenuItem asChild>
                  <Link href="/account" className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/security" className="cursor-pointer">
                    <Smartphone className="w-4 h-4 mr-2" />
                    Devices
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/audit" className="cursor-pointer">
                    <FileCheck className="w-4 h-4 mr-2" />
                    Audit Log
                  </Link>
                </DropdownMenuItem>
              </> : <>
                <DropdownMenuItem asChild>
                  <Link href="/sign-in" className="cursor-pointer"><LogIn className="w-4 h-4 mr-2" />Log in</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/sign-up" className="cursor-pointer"><UserPlus className="w-4 h-4 mr-2" />Create account</Link>
                </DropdownMenuItem>
              </>}
              <DropdownMenuSeparator />

              <DropdownMenuLabel className="md:hidden">Downloads</DropdownMenuLabel>
              <DropdownMenuItem
                className="md:hidden cursor-pointer"
                onClick={() => {
                  toast.success("Downloading for Windows...");
                  window.open('/downloads/oxsig-windows-latest.exe', '_blank');
                }}
              >
                <Monitor className="w-4 h-4 mr-2" />
                Windows App
              </DropdownMenuItem>
              <DropdownMenuItem
                className="md:hidden cursor-pointer"
                onClick={() => {
                  toast.success("Downloading for macOS...");
                  window.open('/downloads/oxsig-macos-latest.dmg', '_blank');
                }}
              >
                <Apple className="w-4 h-4 mr-2" />
                macOS App
              </DropdownMenuItem>
              <DropdownMenuItem
                className="md:hidden cursor-pointer"
                onClick={() => {
                  toast.success("Downloading for Android...");
                  window.open('/downloads/oxsig-android-latest.apk', '_blank');
                }}
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Android App
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => toast("Settings clicked")}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              {isDev && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dev/seed" className="cursor-pointer text-orange-600">
                      <Smartphone className="w-4 h-4 mr-2" />
                      Dev Seeder
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {isAuthenticated && <><DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={signingOut}
                  onSelect={(event) => {
                    event.preventDefault();
                    setSigningOut(true);
                    void logout()
                      .then(() => {
                        toast.success("Signed out");
                        router.replace('/');
                        router.refresh();
                      })
                      .catch(() => toast.error("Sign out failed"))
                      .finally(() => setSigningOut(false));
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
