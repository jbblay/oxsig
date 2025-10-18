"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileSignature, Shield, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const Item = ({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
}) => {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center py-2 text-xs",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon size={20} className="mb-0.5" />
      <span>{label}</span>
    </Link>
  );
};

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="grid grid-cols-5">
        <Item href="/" label="Home" icon={Home} active={pathname === "/"} />
        <Item
          href="/sign"
          label="Sign"
          icon={FileSignature}
          active={pathname?.startsWith("/sign")}
        />
        <Item
          href="/vault"
          label="Vault"
          icon={Lock}
          active={pathname?.startsWith("/vault")}
        />
        <Item
          href="/security"
          label="Security"
          icon={Shield}
          active={pathname?.startsWith("/security")}
        />
        <Item
          href="/features"
          label="Features"
          icon={Sparkles}
          active={pathname?.startsWith("/features")}
        />
      </div>
    </nav>
  );
}