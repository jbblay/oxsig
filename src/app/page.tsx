"use client";

import * as React from "react";
import Link from "next/link";
import { 
  Shield, Fingerprint, Brain, Network, 
  FileSignature, EyeOff, ArrowRight, Users, Edit3, FileCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const features = [
    { 
      icon: FileSignature, 
      label: "Sign Documents", 
      desc: "Smart Signatures",
      color: "from-indigo-500 to-blue-500",
      textColor: "text-indigo-600 dark:text-indigo-400",
      href: "/sign"
    },
    { 
      icon: Edit3, 
      label: "Signature Editor", 
      desc: "Custom Signatures",
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
      href: "/"
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
      icon: EyeOff, 
      label: "Privacy", 
      desc: "Zero-Knowledge",
      color: "from-pink-500 to-rose-500",
      textColor: "text-pink-600 dark:text-pink-400",
      href: "/privacy"
    },
    { 
      icon: Shield, 
      label: "Security Center", 
      desc: "Key Management",
      color: "from-emerald-500 to-green-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      href: "/security"
    },
    { 
      icon: FileCheck, 
      label: "OPSEC Checklist", 
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
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Content */}
      {/* Minimal Header */}
      <div className="text-center relative z-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
          OxSig
        </h1>
        <p className="text-muted-foreground text-sm">
          Quantum-resistant secure communications with self-sovereign identity
        </p>
      </div>

      {/* Small Grid-Based Feature Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 relative z-10">
        {features.map((feature, i) => (
          <Link 
            key={i}
            href={feature.href}
            className="group"
          >
            <div className="p-4 md:p-6 rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:border-muted-foreground/20 transition-all duration-200 hover:shadow-lg">
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <h3 className={`font-semibold text-sm md:text-base mb-1 ${feature.textColor}`}>
                {feature.label}
              </h3>
              <p className="text-xs text-muted-foreground">
                {feature.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
        <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center">
          <div className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400">100%</div>
          <div className="text-xs text-muted-foreground">Quantum Secure</div>
        </div>
        <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center">
          <div className="text-lg md:text-2xl font-bold text-purple-600 dark:text-purple-400">P2P</div>
          <div className="text-xs text-muted-foreground">Decentralized</div>
        </div>
        <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center">
          <div className="text-lg md:text-2xl font-bold text-pink-600 dark:text-pink-400">ZK</div>
          <div className="text-xs text-muted-foreground">Zero Knowledge</div>
        </div>
        <div className="p-3 md:p-4 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 text-center">
          <div className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-400">&lt;50ms</div>
          <div className="text-xs text-muted-foreground">Response Time</div>
        </div>
      </div>

      {/* Minimal CTA */}
      <div className="text-center space-y-3 relative z-10">
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