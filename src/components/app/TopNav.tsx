"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Menu, 
  User, 
  Settings, 
  LogOut, 
  Moon, 
  Sun, 
  Shield,
  FileSignature,
  Lock,
  FileCheck,
  Smartphone,
  Users
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

interface TopNavProps {
  onMenuClick?: () => void;
}

export default function TopNav({ onMenuClick }: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const navLinks = [
    { label: "Sign", href: "/sign", icon: FileSignature },
    { label: "Vault", href: "/vault", icon: Lock },
    { label: "Security", href: "/security", icon: Shield },
    { label: "Audit", href: "/audit", icon: FileCheck },
    { label: "Collab", href: "/collab", icon: Users },
  ];

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur relative">
      {/* soft radial glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-20%,hsl(var(--primary)/0.06),transparent_60%)]" />
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden transition-transform hover:scale-[1.04] active:scale-[0.98]"
              onClick={onMenuClick}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span className="font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
                OxSig
              </span>
            </Link>
          </div>
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-foreground/80 flex items-center gap-1.5",
                  pathname?.startsWith(link.href)
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
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer">
                  <User className="w-4 h-4 mr-2" />
                  Profile
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => toast("Sign out clicked")}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}