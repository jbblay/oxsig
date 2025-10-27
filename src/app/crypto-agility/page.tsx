/**
 * Crypto Agility Dashboard
 * 
 * Visualize and manage cryptographic algorithms in use,
 * track deprecations, and plan quantum transitions.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, AlertTriangle, CheckCircle2, TrendingUp, Zap, 
  Info, RefreshCw, Clock, Award, Activity
} from 'lucide-react';

interface Algorithm {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'deprecated' | 'quantum-safe';
  quantumResistant: boolean;
  performanceRating: number;
  securityRating: number;
  adoptionRate: number;
  usageCount?: number;
}

const ALGORITHMS: Algorithm[] = [
  {
    id: 'ed25519',
    name: 'Ed25519',
    category: 'Signature',
    status: 'active',
    quantumResistant: false,
    performanceRating: 10,
    securityRating: 9,
    adoptionRate: 85,
    usageCount: 15420,
  },
  {
    id: 'dilithium3',
    name: 'Dilithium-3',
    category: 'Signature',
    status: 'quantum-safe',
    quantumResistant: true,
    performanceRating: 7,
    securityRating: 10,
    adoptionRate: 15,
    usageCount: 342,
  },
  {
    id: 'aes-256-gcm',
    name: 'AES-256-GCM',
    category: 'Encryption',
    status: 'active',
    quantumResistant: false,
    performanceRating: 9,
    securityRating: 9,
    adoptionRate: 98,
    usageCount: 28650,
  },
  {
    id: 'x25519',
    name: 'X25519',
    category: 'Key Exchange',
    status: 'active',
    quantumResistant: false,
    performanceRating: 10,
    securityRating: 9,
    adoptionRate: 80,
    usageCount: 12100,
  },
  {
    id: 'kyber768',
    name: 'Kyber-768',
    category: 'Key Exchange',
    status: 'quantum-safe',
    quantumResistant: true,
    performanceRating: 7,
    securityRating: 10,
    adoptionRate: 10,
    usageCount: 89,
  },
  {
    id: 'sha256',
    name: 'SHA-256',
    category: 'Hash',
    status: 'active',
    quantumResistant: true,
    performanceRating: 9,
    securityRating: 9,
    adoptionRate: 99,
    usageCount: 45300,
  },
];

export default function CryptoAgilityPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Calculate health metrics
  const quantumSafeCount = ALGORITHMS.filter(a => a.quantumResistant).length;
  const quantumReadiness = Math.round((quantumSafeCount / ALGORITHMS.length) * 100);
  const avgPerformance = Math.round(
    ALGORITHMS.reduce((sum, a) => sum + a.performanceRating, 0) / ALGORITHMS.length
  );
  const avgSecurity = Math.round(
    ALGORITHMS.reduce((sum, a) => sum + a.securityRating, 0) / ALGORITHMS.length
  );
  
  const overallHealth = Math.round((quantumReadiness * 0.3 + avgPerformance * 10 * 0.3 + avgSecurity * 10 * 0.4));
  
  const filteredAlgorithms = selectedCategory === 'all' 
    ? ALGORITHMS 
    : ALGORITHMS.filter(a => a.category.toLowerCase() === selectedCategory);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-600">Active</Badge>;
      case 'quantum-safe':
        return <Badge className="bg-green-600">Quantum-Safe</Badge>;
      case 'deprecated':
        return <Badge variant="destructive">Deprecated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container max-w-7xl py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Crypto Agility Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Monitor cryptographic algorithms, track deprecations, and plan quantum transitions
        </p>
      </div>

      {/* Health Score Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallHealth}%</div>
            <Progress value={overallHealth} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {overallHealth >= 80 ? '✅ Excellent' : overallHealth >= 60 ? '👍 Good' : '⚠️ Needs attention'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quantum Readiness</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quantumReadiness}%</div>
            <Progress value={quantumReadiness} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {quantumSafeCount}/{ALGORITHMS.length} algorithms quantum-safe
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgPerformance}/10</div>
            <Progress value={avgPerformance * 10} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Average performance rating
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgSecurity}/10</div>
            <Progress value={avgSecurity * 10} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Average security rating
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="algorithms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="algorithms">Algorithms</TabsTrigger>
          <TabsTrigger value="transitions">Transitions</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="algorithms" className="space-y-4">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              All
            </Button>
            <Button
              variant={selectedCategory === 'signature' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('signature')}
            >
              Signatures
            </Button>
            <Button
              variant={selectedCategory === 'encryption' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('encryption')}
            >
              Encryption
            </Button>
            <Button
              variant={selectedCategory === 'key exchange' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('key exchange')}
            >
              Key Exchange
            </Button>
            <Button
              variant={selectedCategory === 'hash' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('hash')}
            >
              Hashing
            </Button>
          </div>

          {/* Algorithms List */}
          <div className="grid gap-4">
            {filteredAlgorithms.map((algo) => (
              <Card key={algo.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{algo.name}</CardTitle>
                      <CardDescription>{algo.category}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge(algo.status)}
                      {algo.quantumResistant && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          <Zap className="h-3 w-3 mr-1" />
                          Quantum-Safe
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Performance</div>
                      <div className="flex items-center gap-2">
                        <Progress value={algo.performanceRating * 10} className="flex-1" />
                        <span className="text-sm font-bold">{algo.performanceRating}/10</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Security</div>
                      <div className="flex items-center gap-2">
                        <Progress value={algo.securityRating * 10} className="flex-1" />
                        <span className="text-sm font-bold">{algo.securityRating}/10</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Adoption</div>
                      <div className="flex items-center gap-2">
                        <Progress value={algo.adoptionRate} className="flex-1" />
                        <span className="text-sm font-bold">{algo.adoptionRate}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Usage Count</div>
                      <div className="text-2xl font-bold">
                        {algo.usageCount?.toLocaleString() || '—'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transitions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quantum Transition Timeline</CardTitle>
              <CardDescription>
                Planned migrations to post-quantum cryptography
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Signatures */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Signature Algorithms</div>
                    <div className="text-sm text-muted-foreground">
                      Ed25519 → Dilithium-3
                    </div>
                  </div>
                  <Badge variant="outline">Planned 2026</Badge>
                </div>
                <Progress value={0} />
                <div className="text-sm text-muted-foreground">
                  Affected: Document Signing, DID Authentication, API Tokens
                </div>
              </div>

              {/* Key Exchange */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Key Exchange</div>
                    <div className="text-sm text-muted-foreground">
                      X25519 → Kyber-768
                    </div>
                  </div>
                  <Badge variant="outline">Planned 2026</Badge>
                </div>
                <Progress value={0} />
                <div className="text-sm text-muted-foreground">
                  Affected: E2E Encryption, Device Pairing, WebRTC
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Cryptographic Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {overallHealth >= 80 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-green-900">Excellent Cryptographic Posture!</div>
                      <div className="text-sm text-green-700">
                        Your system uses modern, secure algorithms with good quantum readiness.
                      </div>
                    </div>
                  </div>
                )}

                {quantumReadiness < 30 && (
                  <div className="flex gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-yellow-900">Low Quantum Readiness</div>
                      <div className="text-sm text-yellow-700">
                        Consider adopting post-quantum algorithms like Dilithium-3 and Kyber-768.
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-blue-900">Hybrid Mode Available</div>
                    <div className="text-sm text-blue-700">
                      Enable hybrid classical/post-quantum mode for maximum security during transition.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <Clock className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-purple-900">Plan Your Quantum Migration</div>
                    <div className="text-sm text-purple-700">
                      NIST recommends completing quantum migration by 2030. Start planning now.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-3">Best Practices</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Regularly review and update cryptographic algorithms</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Monitor NIST and IETF for algorithm deprecations</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Test post-quantum algorithms in non-production environments</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Maintain algorithm diversity for defense in depth</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Document algorithm choices and migration plans</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
