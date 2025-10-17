"use client";

import * as React from "react";
import { 
  FileSignature, Upload, Shield, Lock, Clock, CheckCircle2, 
  AlertTriangle, Download, Share2, Eye, EyeOff, Cpu, Fingerprint, 
  Sparkles, Zap, Users, FileCheck, X, Plus, Loader2, Hash, Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Signer {
  id: string;
  address: string;
  status: 'pending' | 'signed' | 'rejected';
  signedAt?: Date;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  hash?: string;
}

export default function DocumentSigningPage() {
  const [duressMode, setDuressMode] = React.useState(false);
  const [quantumSecure, setQuantumSecure] = React.useState(true);
  const [zkProof, setZkProof] = React.useState(true);
  const [selectedContext, setSelectedContext] = React.useState("legal");
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile | null>(null);
  const [signers, setSigners] = React.useState<Signer[]>([
    { id: '1', address: 'did:example:alice...7a2b', status: 'signed', signedAt: new Date() },
    { id: '2', address: 'did:example:bob...9c4d', status: 'pending' },
  ]);
  const [newSignerAddress, setNewSignerAddress] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [signatureProgress, setSignatureProgress] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Simulated file upload
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setIsProcessing(true);
    setSignatureProgress(0);

    // Simulate upload and hash generation
    const interval = setInterval(() => {
      setSignatureProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setUploadedFile({
            name: file.name,
            size: file.size,
            type: file.type,
            hash: 'sha256:' + Math.random().toString(36).substring(2, 15) + '...'
          });
          toast.success('Document uploaded and encrypted');
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const addSigner = () => {
    if (!newSignerAddress.trim()) {
      toast.error('Please enter a valid DID or address');
      return;
    }
    
    const newSigner: Signer = {
      id: Date.now().toString(),
      address: newSignerAddress,
      status: 'pending'
    };
    
    setSigners([...signers, newSigner]);
    setNewSignerAddress('');
    toast.success('Signer added successfully');
  };

  const removeSigner = (id: string) => {
    setSigners(signers.filter(s => s.id !== id));
    toast.info('Signer removed');
  };

  const handleSign = () => {
    if (!uploadedFile) {
      toast.error('Please upload a document first');
      return;
    }

    setIsProcessing(true);
    setSignatureProgress(0);

    // Simulate signing process
    const interval = setInterval(() => {
      setSignatureProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          toast.success('Document signed successfully!', {
            description: 'Signature anchored to blockchain'
          });
          return 100;
        }
        return prev + 5;
      });
    }, 150);
  };

  const getStatusColor = (status: Signer['status']) => {
    switch (status) {
      case 'signed': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'pending': return 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20';
      case 'rejected': return 'text-red-600 bg-red-500/10 border-red-500/20';
    }
  };

  const securityScore = React.useMemo(() => {
    let score = 70;
    if (quantumSecure) score += 15;
    if (zkProof) score += 10;
    if (duressMode) score += 5;
    return Math.min(score, 100);
  }, [quantumSecure, zkProof, duressMode]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Smart Document Signing
          </h1>
          <p className="text-muted-foreground mt-1">
            Post-quantum cryptographic signatures with multi-context awareness
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="gap-1 animate-pulse">
            <Cpu className="h-3 w-3" />
            Quantum Secure
          </Badge>
          {zkProof && (
            <Badge variant="secondary" className="gap-1">
              <Eye className="h-3 w-3" />
              Zero-Knowledge
            </Badge>
          )}
        </div>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {uploadedFile ? 'Generating quantum signature...' : 'Encrypting document...'}
                  </span>
                  <span className="text-sm text-muted-foreground">{signatureProgress}%</span>
                </div>
                <Progress value={signatureProgress} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Document Upload & Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upload Area */}
          <Card 
            className={`border-2 transition-all ${
              isDragging 
                ? 'border-blue-500 bg-blue-500/5' 
                : uploadedFile 
                  ? 'border-green-500/50 bg-green-500/5' 
                  : 'border-dashed hover:border-primary'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <CardContent className="pt-6">
              {uploadedFile ? (
                <div className="flex items-center gap-4 p-4">
                  <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0">
                    <FileCheck className="h-8 w-8 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold truncate">{uploadedFile.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {(uploadedFile.size / 1024).toFixed(2)} KB • {uploadedFile.type || 'Unknown type'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <code className="text-xs text-muted-foreground font-mono">{uploadedFile.hash}</code>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      setUploadedFile(null);
                      setSignatureProgress(0);
                      toast.info('Document removed');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 transition-transform ${isDragging ? 'scale-110' : ''}`}>
                    <Upload className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {isDragging ? 'Drop document here' : 'Upload Document'}
                  </h3>
                  <p className="text-muted-foreground mb-4 max-w-sm">
                    Drag and drop your document here or click to browse
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    accept=".pdf,.docx,.txt"
                  />
                  <Button 
                    size="lg" 
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
                    ) : (
                      <><Upload className="h-5 w-5" /> Select File</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-4">
                    Supports PDF, DOCX, TXT • Max 50MB • Encrypted on upload
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Signature Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                Signature Configuration
              </CardTitle>
              <CardDescription>
                Configure signature context and security parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Context Selection */}
              <div className="space-y-3">
                <Label>Signature Context</Label>
                <Tabs value={selectedContext} onValueChange={setSelectedContext} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="legal">Legal</TabsTrigger>
                    <TabsTrigger value="financial">Financial</TabsTrigger>
                    <TabsTrigger value="medical">Medical</TabsTrigger>
                    <TabsTrigger value="custom">Custom</TabsTrigger>
                  </TabsList>
                  <TabsContent value={selectedContext} className="mt-4 p-4 rounded-lg bg-accent/50">
                    <p className="text-sm text-muted-foreground">
                      {selectedContext === 'legal' && 'Legally binding signatures with full audit trail and compliance support.'}
                      {selectedContext === 'financial' && 'Financial document signatures with enhanced verification and regulatory compliance.'}
                      {selectedContext === 'medical' && 'HIPAA-compliant medical document signatures with patient consent tracking.'}
                      {selectedContext === 'custom' && 'Custom signature context with flexible parameters and validation rules.'}
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              <Separator />

              {/* Security Options */}
              <div className="space-y-4">
                <Label>Security Features</Label>
                
                <div className="flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-accent/50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Post-Quantum Encryption</Label>
                      <Badge variant="outline" className="text-xs">Dilithium-3</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use quantum-resistant signatures (NIST standard)
                    </p>
                  </div>
                  <Switch checked={quantumSecure} onCheckedChange={(checked) => {
                    setQuantumSecure(checked);
                    toast.success(checked ? 'Quantum security enabled' : 'Quantum security disabled');
                  }} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-accent/50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Zero-Knowledge Proof</Label>
                      <Badge variant="outline" className="text-xs">ZK-SNARKs</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Verify identity without revealing information
                    </p>
                  </div>
                  <Switch checked={zkProof} onCheckedChange={(checked) => {
                    setZkProof(checked);
                    toast.success(checked ? 'ZK proofs enabled' : 'ZK proofs disabled');
                  }} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5 transition-colors hover:bg-red-500/10">
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Duress Mode</Label>
                      <Badge variant="destructive" className="text-xs">Advanced</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create alternate signature if signing under duress
                    </p>
                  </div>
                  <Switch checked={duressMode} onCheckedChange={(checked) => {
                    setDuressMode(checked);
                    if (checked) {
                      toast.warning('Duress mode activated', {
                        description: 'Alternate signature will be generated'
                      });
                    }
                  }} />
                </div>
              </div>

              <Separator />

              {/* Multi-Signature */}
              <div className="space-y-3">
                <Label>Multi-Party Signatures</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Add signer (DID or address)" 
                    value={newSignerAddress}
                    onChange={(e) => setNewSignerAddress(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSigner()}
                  />
                  <Button onClick={addSigner} size="icon" disabled={!newSignerAddress.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    You (Initiator)
                  </Badge>
                  {signers.map((signer) => (
                    <div key={signer.id} className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={`gap-1 flex-1 justify-between ${getStatusColor(signer.status)}`}
                      >
                        <span className="truncate">{signer.address}</span>
                        {signer.status === 'signed' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                        {signer.status === 'pending' && <Clock className="h-3 w-3 shrink-0" />}
                        {signer.status === 'rejected' && <X className="h-3 w-3 shrink-0" />}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => removeSigner(signer.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  className="flex-1 gap-2" 
                  size="lg"
                  onClick={handleSign}
                  disabled={!uploadedFile || isProcessing}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Signing...</>
                  ) : (
                    <><FileSignature className="h-5 w-5" /> Sign Document</>
                  )}
                </Button>
                <Button variant="outline" size="lg" disabled={!uploadedFile}>
                  <Eye className="h-5 w-5 mr-2" />
                  Preview
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Security Info & Status */}
        <div className="space-y-6">
          {/* Security Status */}
          <Card className={`border-2 transition-all ${
            securityScore >= 90 
              ? 'border-green-500/20 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20'
              : securityScore >= 75
                ? 'border-yellow-500/20 bg-gradient-to-br from-yellow-50/50 to-orange-50/50 dark:from-yellow-950/20 dark:to-orange-950/20'
                : 'border-red-500/20 bg-gradient-to-br from-red-50/50 to-pink-50/50 dark:from-red-950/20 dark:to-pink-950/20'
          }`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className={`h-5 w-5 ${
                  securityScore >= 90 ? 'text-green-600' : securityScore >= 75 ? 'text-yellow-600' : 'text-red-600'
                }`} />
                Security Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Overall Security</span>
                  <span className={`font-bold ${
                    securityScore >= 90 ? 'text-green-600' : securityScore >= 75 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {securityScore >= 90 ? 'Excellent' : securityScore >= 75 ? 'Good' : 'Moderate'}
                  </span>
                </div>
                <Progress value={securityScore} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">{securityScore}/100</p>
              </div>

              <div className="space-y-3">
                {quantumSecure && (
                  <div className="flex items-start gap-2 animate-in fade-in slide-in-from-left duration-300">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Quantum Resistant</p>
                      <p className="text-xs text-muted-foreground">Dilithium-3 signature scheme</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Blockchain Anchored</p>
                    <p className="text-xs text-muted-foreground">ICP + Ethereum verification</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Consent Ledger</p>
                    <p className="text-xs text-muted-foreground">Immutable proof recorded</p>
                  </div>
                </div>
                {zkProof && (
                  <div className="flex items-start gap-2 animate-in fade-in slide-in-from-left duration-300">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Zero-Knowledge Auth</p>
                      <p className="text-xs text-muted-foreground">Privacy-preserving verification</p>
                    </div>
                  </div>
                )}
                {duressMode && (
                  <div className="flex items-start gap-2 animate-in fade-in slide-in-from-left duration-300">
                    <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Duress Protection Active</p>
                      <p className="text-xs text-muted-foreground">Alternate signature enabled</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Signature Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Advanced Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Fingerprint className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Biometric Binding</p>
                  <p className="text-xs text-muted-foreground truncate">Link to hardware security key</p>
                </div>
              </button>

              <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Time-Locked</p>
                  <p className="text-xs text-muted-foreground truncate">Set expiration date</p>
                </div>
              </button>

              <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <FileCheck className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Selective Disclosure</p>
                  <p className="text-xs text-muted-foreground truncate">Reveal only needed fields</p>
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Recent Signatures</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: "Contract_2024.pdf", status: "Completed", time: "2h ago", verified: true },
                { name: "NDA_Agreement.pdf", status: "Pending", time: "5h ago", verified: false },
                { name: "Invoice_Jan24.pdf", status: "Completed", time: "1d ago", verified: true },
              ].map((doc, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    doc.verified ? 'bg-green-500/10' : 'bg-yellow-500/10'
                  }`}>
                    <FileSignature className={`h-4 w-4 ${
                      doc.verified ? 'text-green-600' : 'text-yellow-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.time} • {doc.status}</p>
                  </div>
                  {doc.verified && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

