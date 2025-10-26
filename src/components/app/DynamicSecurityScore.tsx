"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Shield, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SecurityRecommendation {
  id: string;
  title: string;
  description: string;
  impact: "High" | "Medium" | "Low";
  action: () => void;
  isCompleted: boolean;
}

const initialRecommendations: SecurityRecommendation[] = [
  {
    id: "rotate-keys",
    title: "Rotate Signing Keys",
    description: "It's been over 90 days since your last key rotation. Regular rotation minimizes risk.",
    impact: "High",
    action: () => new Promise<void>(resolve => setTimeout(() => {
      toast.success("Key rotation initiated!");
      resolve();
    }, 1000)),
    isCompleted: false,
  },
  {
    id: "enable-2fa",
    title: "Enable Biometric 2FA",
    description: "Add an extra layer of security by enabling biometric authentication for critical actions.",
    impact: "High",
    action: () => new Promise<void>(resolve => setTimeout(() => {
      toast.success("Biometric 2FA enabled!");
      resolve();
    }, 1000)),
    isCompleted: false,
  },
  {
    id: "review-permissions",
    title: "Review App Permissions",
    description: "Check which apps have access to your identity data and revoke any that are no longer needed.",
    impact: "Medium",
    action: () => new Promise<void>(resolve => setTimeout(() => {
      toast.info("Redirecting to permission settings...");
      resolve();
    }, 1000)),
    isCompleted: false,
  },
  {
    id: "update-recovery",
    title: "Update PQ Recovery Key",
    description: "Ensure your Post-Quantum recovery key is stored in a safe, offline location.",
    impact: "Low",
    action: () => new Promise<void>(resolve => setTimeout(() => {
      toast.success("Recovery key updated!");
      resolve();
    }, 1000)),
    isCompleted: true,
  },
];

export function DynamicSecurityScore() {
  const [recommendations, setRecommendations] = React.useState(initialRecommendations);

  const completedCount = React.useMemo(() => recommendations.filter(r => r.isCompleted).length, [recommendations]);
  const totalCount = recommendations.length;
  const securityScore = Math.round((completedCount / totalCount) * 100);

  const handleAction = async (rec: SecurityRecommendation) => {
    await rec.action();
    setRecommendations(prev =>
      prev.map(r => (r.id === rec.id ? { ...r, isCompleted: true } : r))
    );
  };

  const getImpactColor = (impact: "High" | "Medium" | "Low") => {
    if (impact === "High") return "text-red-500";
    if (impact === "Medium") return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <Card className="border-2 border-green-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Dynamic Security Score</div>
                <div className="text-2xl font-bold text-green-600">{securityScore}%</div>
              </div>
            </div>
            <Badge variant="default" className="bg-green-600">
              {securityScore > 90 ? "Excellent" : securityScore > 70 ? "Good" : "Needs Improvement"}
            </Badge>
          </div>
          <Progress value={securityScore} className="h-2" />
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Actionable Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.map(rec => (
              <div 
                key={rec.id} 
                className={`p-3 rounded-lg transition-all ${rec.isCompleted ? 'bg-green-500/10' : 'bg-muted/30'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {rec.isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
                    ) : (
                      <AlertTriangle className={`h-5 w-5 ${getImpactColor(rec.impact)} mt-1`} />
                    )}
                    <div>
                      <h4 className="font-semibold text-sm">{rec.title}</h4>
                      <p className="text-xs text-muted-foreground">{rec.description}</p>
                    </div>
                  </div>
                  {!rec.isCompleted && (
                    <Button size="sm" variant="ghost" onClick={() => handleAction(rec)}>
                      Fix Now
                    </Button>
                  )}
                </div>
                {!rec.isCompleted && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 pl-8">
                    <span className="font-medium">Impact:</span>
                    <span className={getImpactColor(rec.impact)}>{rec.impact}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
