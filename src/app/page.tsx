"use client";

import * as React from "react";
import Link from "next/link";
import { 
  Shield, Fingerprint, Brain, Network, 
  FileSignature, Eye, ArrowRight, Users, Edit3, FileCheck, Vault, ScrollText, GitBranch, WifiOff, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const features = [
    { 
      icon: FileSignature, 
      label: "Sign Documents", 
      desc: "Quantum-Secure Signatures",
      color: "from-indigo-500 to-blue-500",
      textColor: "text-indigo-600 dark:text-indigo-400",
      href: "/sign",
      badge: "Core"
    },
    { 
      icon: Vault, 
      label: "Seed Vault", 
      desc: "BIP39 Recovery Phrases",
      color: "from-purple-500 to-violet-500",
      textColor: "text-purple-600 dark:text-purple-400",
      href: "/vault",
      badge: "New"
    },
    { 
      icon: Edit3, 
      label: "Signature Editor", 
      desc: "Create & Save Signatures",
      color: "from-violet-500 to-purple-500",
      textColor: "text-violet-600 dark:text-violet-400",
      href: "/signature-editor"
    },
    { 
      icon: Users, 
      label: "Collaboration", 
      desc: "Secure Chat & Files",
      color: "from-teal-500 to-cyan-500",
      textColor: "text-teal-600 dark:text-teal-400",
      href: "/collab"
    },
    { 
      icon: Fingerprint, 
      label: "Identity", 
      desc: "Self-Sovereign DIDs",
      color: "from-blue-500 to-cyan-500",
      textColor: "text-blue-600 dark:text-blue-400",
      href: "/identity"
    },
    { 
      icon: Eye, 
      label: "Privacy", 
      desc: "Zero-Knowledge Proofs",
      color: "from-pink-500 to-rose-500",
      textColor: "text-pink-600 dark:text-pink-400",
      href: "/privacy"
    },
    { 
      icon: Shield, 
      label: "Security Center", 
      desc: "Key & Device Management",
      color: "from-emerald-500 to-green-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      href: "/security",
      badge: "Enhanced"
    },
    { 
      icon: ScrollText, 
      label: "Audit Log", 
      desc: "Merkle Tree Audit Trail",
      color: "from-cyan-500 to-blue-500",
      textColor: "text-cyan-600 dark:text-cyan-400",
      href: "/audit"
    },
    { 
      icon: FileCheck, 
      label: "OPSEC", 
      desc: "Security Classification",
      color: "from-red-500 to-orange-500",
      textColor: "text-red-600 dark:text-red-400",
      href: "/opsec"
    },
    { 
      icon: Network, 
      label: "Network", 
      desc: "P2P Topology",
      color: "from-orange-500 to-amber-500",
      textColor: "text-orange-600 dark:text-orange-400",
      href: "/network"
    },
    { 
      icon: Brain, 
      label: "AI Security", 
      desc: "Threat Detection",
      color: "from-green-500 to-emerald-500",
      textColor: "text-green-600 dark:text-green-400",
      href: "/ai"
    },
    { 
      icon: GitBranch, 
      label: "Architecture", 
      desc: "System Architecture",
      color: "from-slate-500 to-gray-500",
      textColor: "text-slate-600 dark:text-slate-400",
      href: "/architecture"
    },
    { 
      icon: WifiOff, 
      label: "Offline Mode", 
      desc: "PWA Offline Support",
      color: "from-zinc-500 to-slate-500",
      textColor: "text-zinc-600 dark:text-zinc-400",
      href: "/offline"
    },
    { 
      icon: Sparkles, 
      label: "Features", 
      desc: "Advanced Features",
      color: "from-purple-500 to-pink-500",
      textColor: "text-purple-600 dark:text-purple-400",
      href: "/features"
    }
  ];

  return (
    <div className="space-y-8 pb-12 w-full">
      {/* Minimal Header */}
      <div className="text-center relative z-10 px-4">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
          OxSig
        </h1>
        <p className="text-muted-foreground text-sm">
          Quantum-resistant secure communications with self-sovereign identity
        </p>
      </div>

      {/* Small Grid-Based Feature Widgets - Perfectly Centered */}
      <div className="relative z-10 w-full px-2 sm:px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 justify-items-center">
            {features.map((feature, i) => (
              <Link 
                key={i}
                href={feature.href}
                className="group w-full max-w-[200px]"
              >
                <div className="p-4 md:p-6 rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:border-muted-foreground/20 transition-all duration-200 hover:shadow-lg h-full flex flex-col relative">
                  {feature.badge && (
                    <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-[10px] font-semibold text-white shadow-md">
                      {feature.badge}
                    </div>
                  )}
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform mx-auto`}>
                    <feature.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <h3 className={`font-semibold text-sm md:text-base mb-1 ${feature.textColor} text-center`}>
                    {feature.label}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center">
                    {feature.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats Bar - Centered */}
      <div className="relative z-10 w-full px-2 sm:px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 justify-items-center">
            <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center w-full max-w-[200px]">
              <div className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400">100%</div>
              <div className="text-xs text-muted-foreground">Quantum Secure</div>
            </div>
            <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center w-full max-w-[200px]">
              <div className="text-lg md:text-2xl font-bold text-purple-600 dark:text-purple-400">P2P</div>
              <div className="text-xs text-muted-foreground">Decentralized</div>
            </div>
            <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center w-full max-w-[200px]">
              <div className="text-lg md:text-2xl font-bold text-pink-600 dark:text-pink-400">ZK</div>
              <div className="text-xs text-muted-foreground">Zero Knowledge</div>
            </div>
            <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center w-full max-w-[200px]">
              <div className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-400">&lt;50ms</div>
              <div className="text-xs text-muted-foreground">Response Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Minimal CTA - Centered */}
      <div className="text-center space-y-3 relative z-10 px-4">
        <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg">
          <Shield className="mr-2 h-4 w-4" />
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground">
          Open source • Self-hosted • Privacy-first
        </p>
      </div>
    </div>
  );
}