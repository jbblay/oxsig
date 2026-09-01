"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Network,
  HardDrive,
  Home,
  Lock,
  Presentation,
  Shield,
  Users,
} from "lucide-react";
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
        "flex min-w-[72px] flex-col items-center justify-center px-2 py-2 text-[11px]",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon size={20} className="mb-0.5" />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
};

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex overflow-x-auto overscroll-x-contain">
        <Item href="/home" label="Home" icon={Home} active={pathname === "/home"} />
        <Item
          href="/storage"
          label="Storage"
          icon={HardDrive}
          active={pathname?.startsWith("/storage")}
        />
        <Item
          href="/vault"
          label="Vault"
          icon={Lock}
          active={pathname?.startsWith("/vault")}
        />
        <Item
          href="/collab"
          label="Rooms"
          icon={Users}
          active={pathname === "/collab"}
        />
        <Item
          href="/collab/storyboards"
          label="Boards"
          icon={Presentation}
          active={pathname?.startsWith("/collab/storyboards")}
        />
        <Item
          href="/network"
          label="Cyber Lab"
          icon={Network}
          active={pathname?.startsWith("/network")}
        />
        <Item
          href="/security"
          label="Security"
          icon={Shield}
          active={pathname?.startsWith("/security")}
        />
      </div>
    </nav>
  );
}
