"use client";

import React from "react";
import Link from "next/link";
import { 
  Download, 
  Monitor, 
  Apple, 
  Smartphone, 
  CheckCircle, 
  Shield,
  Zap,
  Lock,
  ArrowRight,
  Github,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function DownloadsPage() {
  const handleDownload = (platform: string, url: string) => {
    toast.success(`Downloading OxSig for ${platform}...`);
    window.open(url, '_blank');
  };

  const platforms = [
    {
      name: "Windows",
      icon: Monitor,
      description: "Windows 10 and 11 (64-bit)",
      version: "v0.1.0",
      size: "~20 MB",
      url: "https://github.com/jbblay/oxsig/releases/download/v0.1.0/oxsig_0.1.0_x64-setup.exe",
      gradient: "from-blue-500 to-blue-600",
      features: ["Native desktop app", "Offline-first", "System tray integration", "Auto-updates"],
      available: true
    },
    {
      name: "macOS",
      icon: Apple,
      description: "macOS 11+ (Apple Silicon & Intel)",
      version: "Coming Soon",
      size: "~25 MB",
      url: "#",
      gradient: "from-gray-600 to-gray-700",
      features: ["Universal binary", "Touch ID support", "Keychain integration", "Notarized by Apple"],
      available: false
    },
    {
      name: "Android",
      icon: Smartphone,
      description: "Android 8.0 and above",
      version: "Coming Soon",
      size: "~15 MB",
      url: "#",
      gradient: "from-green-500 to-green-600",
      features: ["Biometric auth", "QR code scanning", "Offline mode", "Material Design"],
      available: false
    }
  ];

  const features = [
    {
      icon: Shield,
      title: "Quantum-Safe Security",
      description: "Post-quantum cryptography protects your data from future threats"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Optimized performance with native app speed and responsiveness"
    },
    {
      icon: Lock,
      title: "Fully Encrypted",
      description: "End-to-end encryption ensures your data stays private"
    }
  ];

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-block mb-4">
          <Badge variant="outline" className="px-3 py-1">
            <Download className="w-3 h-3 mr-1 inline" />
            Latest Release
          </Badge>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
          Download OxSig
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Get the most secure, quantum-safe document signing and identity management platform. 
          Available for Windows, macOS, and Android.
        </p>
      </div>

      {/* Platform Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {platforms.map((platform) => (
          <Card key={platform.name} className="relative overflow-hidden group hover:shadow-lg transition-all">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${platform.gradient}`} />
            
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${platform.gradient} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <platform.icon className="w-6 h-6 text-white" />
                </div>
                <Badge variant="secondary">{platform.version}</Badge>
              </div>
              <CardTitle className="text-2xl">{platform.name}</CardTitle>
              <CardDescription>{platform.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Download size</span>
                <span className="font-medium">{platform.size}</span>
              </div>

              <ul className="space-y-2">
                {platform.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center text-sm">
                    <CheckCircle className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className="w-full"
                onClick={() => handleDownload(platform.name, platform.url)}
                disabled={!platform.available}
              >
                <Download className="w-4 h-4 mr-2" />
                {platform.available ? `Download for ${platform.name}` : 'Coming Soon'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-center mb-8">Why Download OxSig?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, idx) => (
            <Card key={idx} className="text-center">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* Web App Alternative */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl mb-2">Or use the Web App</CardTitle>
              <CardDescription>
                No installation required. Works on any device with a modern browser.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/">
                Launch Web App
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Additional Info */}
      <div className="mt-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Installation Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Windows</h4>
              <p className="text-muted-foreground">
                Download the .exe installer and run it. Windows may show a SmartScreen warning - click "More info" 
                and "Run anyway" to proceed. The app will install and create a desktop shortcut.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">macOS</h4>
              <p className="text-muted-foreground">
                Download the .dmg file, open it, and drag OxSig to your Applications folder. 
                On first launch, you may need to allow the app in System Preferences → Security & Privacy.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Android</h4>
              <p className="text-muted-foreground">
                Download the .apk file. You may need to enable "Install from Unknown Sources" in your device settings. 
                Open the downloaded file and follow the installation prompts.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Windows</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Windows 10 (1903+) or 11</li>
                  <li>• 4 GB RAM minimum</li>
                  <li>• 200 MB disk space</li>
                  <li>• 64-bit processor</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">macOS</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• macOS 11 Big Sur or later</li>
                  <li>• 4 GB RAM minimum</li>
                  <li>• 250 MB disk space</li>
                  <li>• Intel or Apple Silicon</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Android</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Android 8.0 (Oreo) or later</li>
                  <li>• 2 GB RAM minimum</li>
                  <li>• 100 MB storage space</li>
                  <li>• Camera for QR scanning</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open Source Info */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Github className="w-5 h-5" />
                  Open Source
                </CardTitle>
                <CardDescription className="mt-2">
                  OxSig is open source and available on GitHub. Review the code, contribute, or build it yourself.
                </CardDescription>
              </div>
              <Button variant="outline" asChild>
                <a href="https://github.com/jbblay/oxsig" target="_blank" rel="noopener noreferrer">
                  View on GitHub
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Help Section */}
      <div className="text-center mt-12 p-6 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Need Help?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Check our documentation or join our community for support.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link href="/features">
              View Documentation
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/security">
              Security Guide
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
