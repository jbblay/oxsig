"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarInset, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarSeparator, SidebarInput, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Home, Shield, FileSignature, Fingerprint, Brain, Network, Eye, Users, Edit3, FileCheck, UserCircle, Sparkles, Vault, ScrollText, GitBranch, WifiOff } from "lucide-react";
import MobileNav from "@/components/app/MobileNav";
import TopNav from "@/components/app/TopNav";

type AppShellProps = {
  children: React.ReactNode;
};

// Custom animated menu item component
const AnimatedMenuItem = ({ 
  href, 
  icon: Icon, 
  label, 
  isActive, 
  tooltip,
  gradient,
  badge
}: { 
  href: string; 
  icon: any; 
  label: string; 
  isActive: boolean; 
  tooltip: string;
  gradient: string;
  badge?: string;
}) => {
  // Extract gradient colors for icon styling
  const iconColorClass = gradient.includes('blue') ? 'text-blue-500' :
                          gradient.includes('indigo') ? 'text-indigo-500' :
                          gradient.includes('violet') ? 'text-violet-500' :
                          gradient.includes('teal') ? 'text-teal-500' :
                          gradient.includes('pink') ? 'text-pink-500' :
                          gradient.includes('emerald') ? 'text-emerald-500' :
                          gradient.includes('orange') ? 'text-orange-500' :
                          gradient.includes('red') ? 'text-red-500' :
                          gradient.includes('green') ? 'text-green-500' : 'text-primary';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
        <Link href={href} className="group relative">
          <motion.div
            whileHover={{ scale: 1.15, rotate: 8 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="relative"
          >
            <Icon className={`${iconColorClass} group-hover:drop-shadow-lg transition-all duration-200`} />
            {isActive && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute -inset-1 bg-gradient-to-r opacity-20 rounded-lg blur-sm -z-10"
                style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ duration: 0.3 }}
              />
            )}
          </motion.div>
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className={isActive ? 'font-semibold' : ''}
          >
            {label}
          </motion.span>
          {badge && (
            <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              {badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

function AppShellContent({ children }: AppShellProps) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();

  const coreFeatures = [
    { href: "/", icon: Home, label: "Home", tooltip: "Home", gradient: "from-blue-500 to-cyan-500" },
    { href: "/sign", icon: FileSignature, label: "Sign Documents", tooltip: "Quantum-Secure Signatures", gradient: "from-indigo-500 to-blue-500" },
    { href: "/vault", icon: Vault, label: "Seed Vault", tooltip: "BIP39 Recovery Phrases", gradient: "from-purple-500 to-violet-500", badge: "New" },
    { href: "/signature-editor", icon: Edit3, label: "Signature Editor", tooltip: "Create & Save Signatures", gradient: "from-violet-500 to-purple-500" },
    { href: "/collab", icon: Users, label: "Collaboration", tooltip: "Secure Chat & Files", gradient: "from-teal-500 to-cyan-500" },
    { href: "/identity", icon: Fingerprint, label: "Identity", tooltip: "Self-Sovereign DIDs", gradient: "from-blue-500 to-cyan-500" },
    { href: "/privacy", icon: Eye, label: "Privacy", tooltip: "Zero-Knowledge Proofs", gradient: "from-pink-500 to-rose-500" },
  ];

  const securityFeatures = [
    { href: "/security", icon: Shield, label: "Security Center", tooltip: "Key & Device Management", gradient: "from-emerald-500 to-green-500", badge: "Enhanced" },
    { href: "/audit", icon: ScrollText, label: "Audit Log", tooltip: "Merkle Tree Audit Trail", gradient: "from-cyan-500 to-blue-500" },
    { href: "/opsec", icon: FileCheck, label: "OPSEC", tooltip: "Security Classification", gradient: "from-red-500 to-orange-500" },
    { href: "/network", icon: Network, label: "Network", tooltip: "P2P Topology", gradient: "from-orange-500 to-amber-500" },
    { href: "/ai", icon: Brain, label: "AI Security", tooltip: "Threat Detection", gradient: "from-green-500 to-emerald-500" },
  ];

  const devFeatures = [
    { href: "/architecture", icon: GitBranch, label: "Architecture", tooltip: "System Architecture", gradient: "from-slate-500 to-gray-500" },
    { href: "/offline", icon: WifiOff, label: "Offline Mode", tooltip: "PWA Offline Support", gradient: "from-zinc-500 to-slate-500" },
    { href: "/features", icon: Sparkles, label: "Features", tooltip: "Advanced Features", gradient: "from-purple-500 to-pink-500" },
  ];

  return (
    <>
      <Sidebar collapsible="icon" variant="inset" side="left">
        <SidebarHeader>
          <motion.div 
            className="flex items-center justify-between"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OxSig
            </span>
          </motion.div>
          <SidebarInput placeholder="Search…" />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Core Features</SidebarGroupLabel>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1 }}
            >
              <SidebarMenu>
                {coreFeatures.map((feature, index) => (
                  <motion.div
                    key={feature.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <AnimatedMenuItem
                      href={feature.href}
                      icon={feature.icon}
                      label={feature.label}
                      isActive={pathname === feature.href || pathname?.startsWith(feature.href + "/")}
                      tooltip={feature.tooltip}
                      gradient={feature.gradient}
                      badge={feature.badge}
                    />
                  </motion.div>
                ))}
              </SidebarMenu>
            </motion.div>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Security</SidebarGroupLabel>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1, delay: 0.3 }}
            >
              <SidebarMenu>
                {securityFeatures.map((feature, index) => (
                  <motion.div
                    key={feature.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    <AnimatedMenuItem
                      href={feature.href}
                      icon={feature.icon}
                      label={feature.label}
                      isActive={pathname?.startsWith(feature.href)}
                      tooltip={feature.tooltip}
                      gradient={feature.gradient}
                      badge={feature.badge}
                    />
                  </motion.div>
                ))}
              </SidebarMenu>
            </motion.div>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Developer</SidebarGroupLabel>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1, delay: 0.5 }}
            >
              <SidebarMenu>
                {devFeatures.map((feature, index) => (
                  <motion.div
                    key={feature.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.05 }}
                  >
                    <AnimatedMenuItem
                      href={feature.href}
                      icon={feature.icon}
                      label={feature.label}
                      isActive={pathname?.startsWith(feature.href)}
                      tooltip={feature.tooltip}
                      gradient={feature.gradient}
                    />
                  </motion.div>
                ))}
              </SidebarMenu>
            </motion.div>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="User Profile">
                <Link href="/profile" className="group">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Avatar className="h-8 w-8 border-2 border-primary/20">
                      <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=oxsig" alt="User" />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-semibold">
                        OX
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="text-sm font-medium truncate">OxSig User</span>
                    <span className="text-xs text-muted-foreground truncate">did:key:z6Mk...</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <motion.div 
            className="text-xs text-muted-foreground px-2 pt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            v0.1.0
          </motion.div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <TopNav onMenuClick={toggleSidebar} />
        {/* Background glow for dApp feel */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.06),transparent_60%)]" />
        <div className="px-4 md:px-8 lg:px-12 py-6 pb-20 max-w-7xl mx-auto animate-in fade-in-0 duration-300">
          {children}
        </div>
        <MobileNav />
      </SidebarInset>
    </>
  );
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider className="min-h-svh">
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  );
}