"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircle, Settings, Shield, Bell, Palette, Key, Fingerprint,
  Lock, Globe, Edit, Check, X, Camera, Mail, Phone, MapPin,
  Calendar, Link as LinkIcon, Github, Twitter, Linkedin,
  Download, Upload, Copy, Eye, EyeOff, Trash2, Plus,
  Activity, Award, Clock, TrendingUp, Zap, Users, FileSignature,
  QrCode, Smartphone, Laptop, Monitor, RefreshCw, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/use-auth";

export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [isEditing, setIsEditing] = React.useState(false);
  const [showDID, setShowDID] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [isLoadingProfile, setIsLoadingProfile] = React.useState(true);

  // User data from API
  const [userData, setUserData] = React.useState({
    name: "",
    username: "",
    email: "",
    bio: "",
    location: "",
    website: "",
    did: "",
    joinDate: "",
    avatar: "/avatars/user.png"
  });

  // Fetch real user data from API
  React.useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/users/me', {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setUserData({
            name: data.display_name || data.email || "Anonymous User",
            username: data.email?.split('@')[0] || "user",
            email: data.email || "",
            bio: data.bio || "OxSig user building the decentralized future",
            location: data.location || "",
            website: data.website || "",
            did: data.public_key || `did:oxsig:${data.id}`,
            joinDate: new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) || "Recently",
            avatar: data.avatar_url || "/avatars/user.png"
          });
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    if (!authLoading) {
      fetchUserData();
    }
  }, [authLoading]);

  const [settings, setSettings] = React.useState({
    twoFactorAuth: true,
    biometric: true,
    emailNotifications: true,
    securityAlerts: true,
    darkMode: true,
    autoBackup: true,
    p2pDiscovery: false,
    quantumResistant: true
  });

  const stats = [
    { label: "Documents Signed", value: "247", icon: FileSignature, color: "text-blue-500" },
    { label: "Collaborations", value: "34", icon: Users, color: "text-teal-500" },
    { label: "Security Score", value: "98%", icon: Shield, color: "text-emerald-500" },
    { label: "Uptime", value: "99.9%", icon: TrendingUp, color: "text-purple-500" }
  ];

  const recentActivity = [
    { action: "Signed document", file: "Q4_Report.pdf", time: "2 hours ago", icon: FileSignature },
    { action: "Updated DID", detail: "Added new verification method", time: "1 day ago", icon: Fingerprint },
    { action: "Joined collaboration", detail: "Project Quantum", time: "3 days ago", icon: Users },
    { action: "Security scan completed", detail: "No threats detected", time: "5 days ago", icon: Shield }
  ];

  const connectedDevices = [
    { name: "MacBook Pro", type: "laptop", lastActive: "Active now", trusted: true, icon: Laptop },
    { name: "iPhone 15 Pro", type: "mobile", lastActive: "5 min ago", trusted: true, icon: Smartphone },
    { name: "iPad Air", type: "tablet", lastActive: "2 hours ago", trusted: true, icon: Monitor }
  ];

  const cryptoKeys = [
    { id: 1, name: "Primary Signing Key", type: "CRYSTALS-Dilithium", created: "Jan 2024", uses: 247, status: "active" },
    { id: 2, name: "Backup Key", type: "SPHINCS+", created: "Jan 2024", uses: 12, status: "backup" },
    { id: 3, name: "Legacy Key", type: "RSA-4096", created: "Dec 2023", uses: 89, status: "deprecated" }
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  // Show loading state
  if (authLoading || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Show login required state
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <UserCircle className="h-16 w-16 mx-auto text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold">Authentication Required</h2>
            <p className="text-muted-foreground mt-2">Please log in to view your profile</p>
          </div>
          <Button onClick={() => window.location.href = '/auth'}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Avatar and Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 relative">
            <motion.div
              className="absolute inset-0 opacity-30"
              animate={{
                backgroundPosition: ["0% 0%", "100% 100%"],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: "reverse"
              }}
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                backgroundSize: "60px 60px"
              }}
            />
          </div>
          <CardContent className="relative pt-0">
            <div className="flex flex-col md:flex-row md:items-end gap-6 -mt-16 md:-mt-12">
              <div className="relative group">
                <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                  <AvatarImage src={userData.avatar} alt={userData.name} />
                  <AvatarFallback className="text-3xl bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {userData.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 h-10 w-10 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  {isEditing ? (
                    <Input
                      value={userData.name}
                      onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                      className="text-2xl font-bold max-w-xs"
                    />
                  ) : (
                    <h1 className="text-2xl md:text-3xl font-bold">{userData.name}</h1>
                  )}
                  <Button
                    variant={isEditing ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-muted-foreground">@{userData.username}</p>
                <p className="text-sm">{userData.bio}</p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {userData.location}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Joined {userData.joinDate}
                  </div>
                  <div className="flex items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    <a href={userData.website} className="hover:underline text-blue-500">{userData.website}</a>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <QrCode className="h-4 w-4 mr-2" />
                  Share Profile
                </Button>
                <Button size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <stat.icon className={`h-6 w-6 mx-auto mb-2 ${stat.color}`} />
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <activity.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{activity.action}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {activity.file || activity.detail}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Achievements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 text-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <p className="font-semibold text-sm">Security Pro</p>
                    <p className="text-xs text-muted-foreground">100+ secure ops</p>
                  </div>
                  <div className="p-4 text-center rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                    <FileSignature className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                    <p className="font-semibold text-sm">Signature Master</p>
                    <p className="text-xs text-muted-foreground">200+ documents</p>
                  </div>
                  <div className="p-4 text-center rounded-lg bg-gradient-to-br from-teal-500/10 to-green-500/10 border border-teal-500/20">
                    <Users className="h-8 w-8 mx-auto mb-2 text-teal-500" />
                    <p className="font-semibold text-sm">Team Player</p>
                    <p className="text-xs text-muted-foreground">30+ collabs</p>
                  </div>
                  <div className="p-4 text-center rounded-lg bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
                    <Zap className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                    <p className="font-semibold text-sm">Early Adopter</p>
                    <p className="text-xs text-muted-foreground">Beta tester</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage your security preferences and authentication methods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                </div>
                <Switch
                  checked={settings.twoFactorAuth}
                  onCheckedChange={(checked) => setSettings({ ...settings, twoFactorAuth: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Biometric Authentication</Label>
                  <p className="text-sm text-muted-foreground">Use fingerprint or face recognition</p>
                </div>
                <Switch
                  checked={settings.biometric}
                  onCheckedChange={(checked) => setSettings({ ...settings, biometric: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Security Alerts</Label>
                  <p className="text-sm text-muted-foreground">Notify me of suspicious activity</p>
                </div>
                <Switch
                  checked={settings.securityAlerts}
                  onCheckedChange={(checked) => setSettings({ ...settings, securityAlerts: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Quantum-Resistant Encryption</Label>
                  <p className="text-sm text-muted-foreground">Use post-quantum cryptography</p>
                </div>
                <Switch
                  checked={settings.quantumResistant}
                  onCheckedChange={(checked) => setSettings({ ...settings, quantumResistant: checked })}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-base">Cryptographic Keys</Label>
                <div className="space-y-2">
                  {cryptoKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{key.name}</p>
                          <p className="text-xs text-muted-foreground">{key.type} • {key.uses} uses • {key.created}</p>
                        </div>
                      </div>
                      <Badge variant={key.status === "active" ? "default" : key.status === "backup" ? "secondary" : "outline"}>
                        {key.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate New Key Pair
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Identity Tab */}
        <TabsContent value="identity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Decentralized Identity (DID)</CardTitle>
              <CardDescription>Your self-sovereign identity on the OxSig network</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Your DID</Label>
                <div className="flex gap-2">
                  <Input
                    value={userData.did}
                    readOnly
                    type={showDID ? "text" : "password"}
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" size="icon" onClick={() => setShowDID(!showDID)}>
                    {showDID ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(userData.did)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is your unique, self-sovereign identifier. Share it with others to receive encrypted messages.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Verification Methods</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium text-sm">Email</p>
                        <p className="text-xs text-muted-foreground">{userData.email}</p>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-500">Verified</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Fingerprint className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="font-medium text-sm">Biometric</p>
                        <p className="text-xs text-muted-foreground">Face ID / Touch ID</p>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-dashed">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Social Verification</p>
                        <p className="text-xs text-muted-foreground">Connect social accounts</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Add</Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Export DID Document
                </Button>
                <Button variant="outline" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rotate Keys
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connected Devices</CardTitle>
              <CardDescription>Manage devices that have access to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {connectedDevices.map((device, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <device.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-sm text-muted-foreground">{device.lastActive}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {device.trusted && (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Trusted
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add New Device
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Customize your experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive updates via email</p>
                </div>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Use dark theme</p>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => setSettings({ ...settings, darkMode: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">Auto Backup</Label>
                  <p className="text-sm text-muted-foreground">Automatically backup encrypted data</p>
                </div>
                <Switch
                  checked={settings.autoBackup}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoBackup: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base">P2P Discovery</Label>
                  <p className="text-sm text-muted-foreground">Allow others to discover you on the network</p>
                </div>
                <Switch
                  checked={settings.p2pDiscovery}
                  onCheckedChange={(checked) => setSettings({ ...settings, p2pDiscovery: checked })}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Data & Privacy</Label>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
