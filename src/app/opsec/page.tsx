"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  Lock, 
  Eye, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Crown,
  Zap,
  Fingerprint,
  Radio,
  Database,
  Key,
  FileCheck
} from "lucide-react";

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  completed: boolean;
  priority: "critical" | "high" | "medium" | "low";
};

type ClassificationLevel = {
  level: number;
  name: string;
  color: string;
  gradient: string;
  icon: any;
  description: string;
  requirements: string[];
  minScore: number;
};

export default function OpsecPage() {
  const [checklist, setChecklist] = React.useState<ChecklistItem[]>([
    // Identity & Authentication
    {
      id: "1",
      title: "Enable Multi-Factor Authentication",
      description: "Use hardware keys (YubiKey) or authenticator apps",
      category: "identity",
      completed: false,
      priority: "critical"
    },
    {
      id: "2",
      title: "Implement Decentralized Identity (DID)",
      description: "Create and verify self-sovereign identity credentials",
      category: "identity",
      completed: false,
      priority: "high"
    },
    {
      id: "3",
      title: "Rotate Cryptographic Keys",
      description: "Update encryption keys every 90 days",
      category: "identity",
      completed: false,
      priority: "high"
    },

    // Communication Security
    {
      id: "4",
      title: "Use End-to-End Encryption",
      description: "Enable E2EE for all sensitive communications",
      category: "communication",
      completed: false,
      priority: "critical"
    },
    {
      id: "5",
      title: "Enable Perfect Forward Secrecy",
      description: "Ensure session keys can't decrypt past messages",
      category: "communication",
      completed: false,
      priority: "high"
    },
    {
      id: "6",
      title: "Use Onion Routing for P2P",
      description: "Route traffic through multiple encrypted layers",
      category: "communication",
      completed: false,
      priority: "medium"
    },

    // Data Protection
    {
      id: "7",
      title: "Encrypt Data at Rest",
      description: "Use AES-256 or quantum-resistant encryption",
      category: "data",
      completed: false,
      priority: "critical"
    },
    {
      id: "8",
      title: "Implement Zero-Knowledge Proofs",
      description: "Verify data without exposing sensitive information",
      category: "data",
      completed: false,
      priority: "high"
    },
    {
      id: "9",
      title: "Enable Secure Backup",
      description: "Encrypted, distributed backup with recovery phrases",
      category: "data",
      completed: false,
      priority: "high"
    },

    // Network Security
    {
      id: "10",
      title: "Use VPN or Tor Network",
      description: "Hide IP address and encrypt network traffic",
      category: "network",
      completed: false,
      priority: "high"
    },
    {
      id: "11",
      title: "Disable Metadata Leakage",
      description: "Strip EXIF data and other metadata from files",
      category: "network",
      completed: false,
      priority: "medium"
    },
    {
      id: "12",
      title: "Enable DNS over HTTPS",
      description: "Encrypt DNS queries to prevent surveillance",
      category: "network",
      completed: false,
      priority: "medium"
    },

    // Device Security
    {
      id: "13",
      title: "Full Disk Encryption",
      description: "Encrypt entire device storage",
      category: "device",
      completed: false,
      priority: "critical"
    },
    {
      id: "14",
      title: "Secure Boot Configuration",
      description: "Enable secure boot and TPM",
      category: "device",
      completed: false,
      priority: "high"
    },
    {
      id: "15",
      title: "Regular Security Audits",
      description: "Monthly security assessment and penetration testing",
      category: "device",
      completed: false,
      priority: "medium"
    },
  ]);

  const classificationLevels: ClassificationLevel[] = [
    {
      level: 1,
      name: "UNCLASSIFIED",
      color: "text-gray-500",
      gradient: "from-gray-400 to-gray-600",
      icon: FileCheck,
      description: "Public information with no security requirements",
      requirements: ["Basic encryption", "Standard authentication"],
      minScore: 0
    },
    {
      level: 2,
      name: "CONFIDENTIAL",
      color: "text-blue-500",
      gradient: "from-blue-400 to-blue-600",
      icon: Lock,
      description: "Sensitive information requiring protection",
      requirements: ["E2EE enabled", "2FA authentication", "Key rotation"],
      minScore: 30
    },
    {
      level: 3,
      name: "SECRET",
      color: "text-purple-500",
      gradient: "from-purple-400 to-purple-600",
      icon: Shield,
      description: "Highly sensitive information requiring strict controls",
      requirements: ["Zero-Knowledge proofs", "Onion routing", "Hardware keys", "Full disk encryption"],
      minScore: 60
    },
    {
      level: 4,
      name: "TOP SECRET",
      color: "text-orange-500",
      gradient: "from-orange-400 to-red-600",
      icon: Crown,
      description: "Critical information requiring maximum security",
      requirements: ["Quantum-resistant encryption", "Air-gapped systems", "Biometric verification", "All SECRET requirements"],
      minScore: 85
    }
  ];

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev =>
      prev.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const calculateScore = () => {
    const totalItems = checklist.length;
    const completedItems = checklist.filter(item => item.completed).length;
    const criticalCompleted = checklist.filter(item => item.priority === "critical" && item.completed).length;
    const totalCritical = checklist.filter(item => item.priority === "critical").length;
    
    // Weight critical items more heavily
    const baseScore = (completedItems / totalItems) * 70;
    const criticalBonus = (criticalCompleted / totalCritical) * 30;
    
    return Math.round(baseScore + criticalBonus);
  };

  const getCurrentClassification = () => {
    const score = calculateScore();
    return classificationLevels
      .slice()
      .reverse()
      .find(level => score >= level.minScore) || classificationLevels[0];
  };

  const getCategoryStats = (category: string) => {
    const items = checklist.filter(item => item.category === category);
    const completed = items.filter(item => item.completed).length;
    return { total: items.length, completed, percentage: (completed / items.length) * 100 };
  };

  const score = calculateScore();
  const currentClassification = getCurrentClassification();

  const categories = [
    { id: "identity", name: "Identity & Auth", icon: Fingerprint, color: "from-blue-500 to-cyan-500" },
    { id: "communication", name: "Communications", icon: Radio, color: "from-purple-500 to-pink-500" },
    { id: "data", name: "Data Protection", icon: Database, color: "from-green-500 to-emerald-500" },
    { id: "network", name: "Network Security", icon: Zap, color: "from-orange-500 to-amber-500" },
    { id: "device", name: "Device Security", icon: Key, color: "from-indigo-500 to-blue-500" },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-2">OPSEC Checklist & Classification</h1>
        <p className="text-muted-foreground">
          Operational Security assessment and clearance level determination
        </p>
      </motion.div>

      {/* Current Classification Status */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-2 relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-r ${currentClassification.gradient} opacity-5`} />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${currentClassification.gradient}`}>
                  <currentClassification.icon className="h-8 w-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">
                    Current Classification: <span className={currentClassification.color}>{currentClassification.name}</span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {currentClassification.description}
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {score}%
                </div>
                <div className="text-xs text-muted-foreground">Security Score</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={score} className="h-3" />
            <div className="mt-4 flex gap-2 flex-wrap">
              {currentClassification.requirements.map((req, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {req}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Classification Levels */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Security Classification Levels</CardTitle>
            <CardDescription>Progress through clearance levels by completing OPSEC requirements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {classificationLevels.map((level, index) => (
                <motion.div
                  key={level.level}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    score >= level.minScore 
                      ? `border-${level.color.replace('text-', '')} bg-gradient-to-br ${level.gradient} bg-opacity-5` 
                      : 'border-muted bg-muted/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <level.icon className={`h-5 w-5 ${score >= level.minScore ? level.color : 'text-muted-foreground'}`} />
                    <h3 className={`font-semibold ${score >= level.minScore ? level.color : 'text-muted-foreground'}`}>
                      {level.name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{level.description}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant={score >= level.minScore ? "default" : "outline"} className="text-xs">
                      {level.minScore}% Required
                    </Badge>
                    {score >= level.minScore && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* OPSEC Checklist */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map(cat => (
              <TabsTrigger key={cat.id} value={cat.id}>
                <cat.icon className="h-4 w-4 mr-2" />
                {cat.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            {categories.map((cat, catIndex) => {
              const stats = getCategoryStats(cat.id);
              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + catIndex * 0.1 }}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${cat.color}`}>
                            <cat.icon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{cat.name}</CardTitle>
                            <CardDescription>
                              {stats.completed} of {stats.total} completed
                            </CardDescription>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{Math.round(stats.percentage)}%</div>
                          <Progress value={stats.percentage} className="w-24 h-2 mt-1" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {checklist
                        .filter(item => item.category === cat.id)
                        .map((item, itemIndex) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6 + itemIndex * 0.05 }}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div className="mt-1">
                              <Checkbox
                                id={item.id}
                                checked={item.completed}
                                onCheckedChange={() => toggleChecklistItem(item.id)}
                              />
                            </div>
                            <div className="flex-1">
                              <label
                                htmlFor={item.id}
                                className={`font-medium cursor-pointer ${
                                  item.completed ? 'line-through text-muted-foreground' : ''
                                }`}
                              >
                                {item.title}
                              </label>
                              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                            </div>
                            <Badge
                              variant={
                                item.priority === "critical" ? "destructive" :
                                item.priority === "high" ? "default" :
                                "secondary"
                              }
                              className="text-xs"
                            >
                              {item.priority.toUpperCase()}
                            </Badge>
                          </motion.div>
                        ))}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </TabsContent>

          {categories.map(cat => (
            <TabsContent key={cat.id} value={cat.id} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${cat.color}`}>
                      <cat.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle>{cat.name}</CardTitle>
                      <CardDescription>
                        {getCategoryStats(cat.id).completed} of {getCategoryStats(cat.id).total} completed
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {checklist
                    .filter(item => item.category === cat.id)
                    .map(item => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="mt-1">
                          <Checkbox
                            id={item.id}
                            checked={item.completed}
                            onCheckedChange={() => toggleChecklistItem(item.id)}
                          />
                        </div>
                        <div className="flex-1">
                          <label
                            htmlFor={item.id}
                            className={`font-medium cursor-pointer ${
                              item.completed ? 'line-through text-muted-foreground' : ''
                            }`}
                          >
                            {item.title}
                          </label>
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        </div>
                        <Badge
                          variant={
                            item.priority === "critical" ? "destructive" :
                            item.priority === "high" ? "default" :
                            "secondary"
                          }
                          className="text-xs"
                        >
                          {item.priority.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>
    </div>
  );
}
