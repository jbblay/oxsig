"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Shield, Fingerprint, Brain, Network, 
  FileSignature, Eye, ArrowRight, Users, Edit3, FileCheck, Vault, ScrollText, GitBranch, WifiOff, Sparkles, HardDrive, Download,
  Activity, TrendingUp, Lock, CheckCircle2, AlertCircle, Zap, Bell, Settings, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SystemStatus from "@/components/system/SystemStatus";
import { useAuth } from "@/lib/auth/use-auth";

export default function Home() {
  const router = useRouter();
  const { user, isLoading, authMethod } = useAuth();
  const [userData, setUserData] = React.useState<any>(null);

  // Fetch user data if authenticated
  React.useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        try {
          const response = await fetch('/api/users/me', {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            setUserData(data);
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
        }
      }
    };

    if (!isLoading) {
      fetchUserData();
    }
  }, [user, isLoading]);

  // Show authenticated dashboard
  if (user && !isLoading) {
    return <AuthenticatedHome user={user} userData={userData} authMethod={authMethod} />;
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Show marketing page for unauthenticated users
  return <MarketingHome />;
}

// Dashboard for authenticated users
function AuthenticatedHome({ user, userData, authMethod }: any) {
  const router = useRouter();

  const stats = [
    {
      label: "Documents Signed",
      value: "0",
      change: "+0%",
      icon: FileSignature,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Active Collaborations",
      value: "0",
      change: "+0%",
      icon: Users,
      color: "text-teal-500",
      bgColor: "bg-teal-500/10"
    },
    {
      label: "Security Score",
      value: authMethod === 'email' ? "85%" : "92%",
      change: "+5%",
      icon: Shield,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      label: "Storage Used",
      value: "0 MB",
      change: "0%",
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    }
  ];

  const recentActivity = [
    {
      type: "auth",
      title: `Logged in with ${authMethod === 'email' ? 'Email/Password' : 'DID'}`,
      time: "Just now",
      icon: CheckCircle2,
      color: "text-green-500"
    }
  ];

  const quickActions = [
    {
      title: "Sign Document",
      description: "Upload and sign a new document",
      icon: FileSignature,
      color: "bg-blue-500",
      href: "/sign"
    },
    {
      title: "Start Collaboration",
      description: "Invite others to collaborate",
      icon: Users,
      color: "bg-teal-500",
      href: "/collab"
    },
    {
      title: "Access Vault",
      description: "Manage your secure vault",
      icon: Lock,
      color: "bg-purple-500",
      href: "/vault"
    },
    {
      title: "View Documents",
      description: "Browse signed documents",
      icon: Eye,
      color: "bg-pink-500",
      href: "/downloads"
    }
  ];

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back, {userData.display_name || userData.email?.split('@')[0] || 'User'}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening with your documents today
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => router.push('/profile')}>
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Auth Method Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {authMethod === 'email' ? (
              <>
                <Shield className="h-3 w-3" />
                Authenticated with Email
              </>
            ) : (
              <>
                <Zap className="h-3 w-3" />
                Authenticated with DID
              </>
            )}
          </Badge>
          {userData.role === 'admin' && (
            <Badge variant="default">Admin</Badge>
          )}
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {stat.change}
                  </Badge>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action, index) => (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.1 }}
            >
              <Card
                className="cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => router.push(action.href)}
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-lg ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                  <ArrowRight className="h-4 w-4 mt-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your latest actions and events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
                    <div className={`p-2 rounded-lg bg-muted`}>
                      <activity.icon className={`h-4 w-4 ${activity.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{activity.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                    </div>
                  </div>
                ))}
                {recentActivity.length === 1 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Getting Started */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Getting Started
              </CardTitle>
              <CardDescription>Complete your profile setup</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Account Created</p>
                    <p className="text-xs text-muted-foreground">Your account is set up</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Authentication Configured</p>
                    <p className="text-xs text-muted-foreground">Using {authMethod === 'email' ? 'Email/Password' : 'DID'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 opacity-50">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Sign Your First Document</p>
                    <p className="text-xs text-muted-foreground">Try signing a document</p>
                  </div>
                </div>

                <Button className="w-full mt-4" onClick={() => router.push('/profile')}>
                  Complete Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// Marketing page for unauthenticated users
function MarketingHome() {
  const router = useRouter();

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
      icon: HardDrive, 
      label: "Secure Storage", 
      desc: "Encrypted File Storage",
      color: "from-emerald-500 to-green-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      href: "/storage",
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
      label: "Security", 
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
    <div className="space-y-8 pb-12 w-full relative">
      {/* Minimal Header */}
      <div className="text-center relative z-10 px-4">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
          OxSig
        </h1>
        <p className="text-muted-foreground text-sm mb-4">
          Quantum-resistant secure communications with self-sovereign identity
        </p>
        
        {/* Download CTA */}
        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
            <a href="https://github.com/jbblay/oxsig/releases/download/v0.1.0/oxsig_0.1.0_x64-setup.exe" target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4 mr-2" />
              Download for Windows
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/downloads">
              All Platforms
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      {/* System Status */}
      <div className="relative z-10 w-full px-2 sm:px-4">
        <SystemStatus />
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
        <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg" onClick={() => router.push('/auth')}>
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