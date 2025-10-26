"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileSignature, Users, Shield, TrendingUp, Activity,
  Lock, Eye, ArrowRight, Zap, Bell, Settings, Loader2,
  CheckCircle2, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/use-auth";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading, authMethod } = useAuth();
  const [userData, setUserData] = React.useState<any>(null);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Fetch user data
  React.useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        try {
          const response = await fetch('/api/users/me', {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            setUserData(data.user || data);
          } else {
            // If API fails, use user data from auth context
            setUserData(user);
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
          // If API fails, use user data from auth context
          setUserData(user);
        }
      }
    };

    if (!isLoading && user) {
      fetchUserData();
    }
  }, [user, isLoading]);

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

  if (isLoading || !userData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
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
              Welcome back, {userData.displayName || userData.display_name || userData.email?.split('@')[0] || 'User'}! 👋
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
              onClick={() => router.push(action.href)}
              className="cursor-pointer"
            >
              <Card className="hover:shadow-lg transition-shadow group">
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
