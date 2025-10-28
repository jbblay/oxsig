'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Key, 
  Copy, 
  Download, 
  QrCode, 
  Fingerprint,
  Users,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Lock
} from 'lucide-react';
import { 
  generateSeedPhrase, 
  createSeedVault,
  validateMnemonic,
  calculateSeedStrength,
  exportSeedPaper,
  exportSeedQR,
  type WordCount,
  type SeedVault
} from '@/lib/vault/seed-vault';
import { saveVault } from '@/lib/db/vaults';
import { QRCodeSVG } from 'qrcode.react';

interface SeedVaultCreatorProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (vaultId: string) => void;
}

export function SeedVaultCreator({ open, onClose, onSuccess }: SeedVaultCreatorProps) {
  const [step, setStep] = useState<'setup' | 'generate' | 'backup' | 'verify' | 'complete'>('setup');
  const [wordCount, setWordCount] = useState<WordCount>(12);
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [vault, setVault] = useState<SeedVault | null>(null);
  const [verifyWords, setVerifyWords] = useState<Record<number, string>>({});
  const [exportFormat, setExportFormat] = useState<'paper' | 'qr'>('paper');
  const [copied, setCopied] = useState(false);

  const passwordStrength = password.length >= 8 
    ? Math.min(5, Math.floor(password.length / 3) + ((/[A-Z]/.test(password) ? 1 : 0) + (/[0-9]/.test(password) ? 1 : 0) + (/[^a-zA-Z0-9]/.test(password) ? 1 : 0)))
    : 0;

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const seedStrength = calculateSeedStrength(wordCount);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open]);

  function resetState() {
    setStep('setup');
    setWordCount(12);
    setLabel('');
    setPassword('');
    setConfirmPassword('');
    setMnemonic([]);
    setVault(null);
    setVerifyWords({});
  }

  async function handleGenerate() {
    if (!label || !passwordsMatch || passwordStrength < 3) {
      return;
    }

    try {
      const { mnemonic: words } = await generateSeedPhrase(wordCount);
      setMnemonic(words);
      
      const newVault = await createSeedVault(password, wordCount, label);
      setVault(newVault);
      
      setStep('generate');
    } catch (error) {
      console.error('Failed to generate seed:', error);
    }
  }

  function handleCopyMnemonic() {
    navigator.clipboard.writeText(mnemonic.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadPaper() {
    if (!vault) return;
    
    const paperBackup = exportSeedPaper(mnemonic, {
      label: vault.metadata.label,
      created: vault.createdAt,
    });
    
    const blob = new Blob([paperBackup], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oxsig-vault-${label.replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleVerify() {
    const verifyIndices = [2, 5, 8]; // Verify words 3, 6, 9
    const allCorrect = verifyIndices.every(
      idx => verifyWords[idx]?.toLowerCase().trim() === mnemonic[idx]
    );

    if (allCorrect && vault) {
      await saveVault(vault);
      setStep('complete');
      setTimeout(() => {
        onSuccess(vault.id);
        onClose();
      }, 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...{className: "max-w-2xl max-h-[90vh] overflow-y-auto"} as any}>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Create Seed Vault
            </div>
          </DialogTitle>
          <DialogDescription>
            Secure your identity with an encrypted recovery phrase
          </DialogDescription>
        </DialogHeader>

        {/* Setup Step */}
        {step === 'setup' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Vault Label</Label>
              <Input
                placeholder="e.g., Primary Identity, Work Account"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Seed Strength</Label>
              <div className="flex gap-2">
                {[12, 15, 18, 21, 24].map((count) => (
                  <Button
                    key={count}
                    variant={wordCount === count ? 'default' : 'outline'}
                    onClick={() => setWordCount(count as WordCount)}
                    className="flex-1"
                  >
                    {count} words
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{seedStrength.bits} bits</span>
                <Badge variant={seedStrength.score >= 4 ? 'default' : 'secondary'}>
                  {seedStrength.label}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Master Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              
              {/* Password Strength Indicator */}
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded ${
                        passwordStrength >= level
                          ? level <= 2 ? 'bg-red-500' : level <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {passwordStrength === 0 && 'Enter a password'}
                  {passwordStrength === 1 && 'Weak password'}
                  {passwordStrength === 2 && 'Fair password'}
                  {passwordStrength === 3 && 'Good password'}
                  {passwordStrength === 4 && 'Strong password'}
                  {passwordStrength === 5 && 'Maximum strength'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && (
                <div className="flex items-center gap-1 text-sm">
                  {passwordsMatch ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" /> Passwords match</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4 text-red-500" /> Passwords don't match</>
                  )}
                </div>
              )}
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold">What happens next:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li>Generate secure {wordCount}-word seed phrase</li>
                      <li>Encrypt with your password</li>
                      <li>Create multiple backup options</li>
                      <li>Verify you've saved it correctly</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleGenerate}
              disabled={!label || !passwordsMatch || passwordStrength < 3}
              className="w-full"
            >
              <Key className="h-4 w-4 mr-2" />
              Generate Seed Phrase
            </Button>
          </div>
        )}

        {/* Generate Step */}
        {step === 'generate' && (
          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold text-purple-900">Your Seed Phrase</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {mnemonic.map((word, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200"
                    >
                      <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                      <span className="font-mono font-semibold">{word}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyMnemonic}
                    className="flex-1"
                  >
                    {copied ? (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> Copied!</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-2" /> Copy All</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-900">
                    <p className="font-semibold mb-2">Critical Security Warning:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Never share these words with anyone</li>
                      <li>Anyone with these words can access your vault</li>
                      <li>Store multiple backups in secure locations</li>
                      <li>We cannot recover these words if lost</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('setup')} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep('backup')} className="flex-1">
                I've Saved It
              </Button>
            </div>
          </div>
        )}

        {/* Backup Step */}
        {step === 'backup' && vault && (
          <div className="space-y-6">
            <Tabs value={exportFormat} onValueChange={(v) => setExportFormat(v as 'paper' | 'qr')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paper">
                  <Download className="h-4 w-4 mr-2" />
                  Paper Backup
                </TabsTrigger>
                <TabsTrigger value="qr">
                  <QrCode className="h-4 w-4 mr-2" />
                  QR Code
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paper" className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <pre className="text-xs font-mono whitespace-pre bg-gray-50 p-4 rounded border overflow-x-auto">
                      {exportSeedPaper(mnemonic, { label, created: vault.createdAt })}
                    </pre>
                  </CardContent>
                </Card>
                
                <Button onClick={handleDownloadPaper} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download Paper Backup
                </Button>
              </TabsContent>

              <TabsContent value="qr" className="space-y-4">
                <Card>
                  <CardContent className="pt-6 flex flex-col items-center">
                    <div className="bg-white p-4 rounded-lg shadow-lg">
                      <QRCodeSVG value={exportSeedQR(mnemonic)} size={256} level="H" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-4 max-w-sm">
                      Scan this QR code to import your seed vault on another device
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <h4 className="font-semibold text-blue-900 mb-2">Recovery Methods Available:</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Master password recovery</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-50">
                    <Fingerprint className="h-4 w-4" />
                    <span>Biometric unlock (coming soon)</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-50">
                    <Users className="h-4 w-4" />
                    <span>Social recovery (coming soon)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('generate')} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep('verify')} className="flex-1">
                Continue to Verification
              </Button>
            </div>
          </div>
        )}

        {/* Verify Step */}
        {step === 'verify' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              To ensure you've saved your seed phrase correctly, please enter these specific words:
            </p>

            {[2, 5, 8].map((idx) => (
              <div key={idx} className="space-y-2">
                <Label>Word #{idx + 1}</Label>
                <Input
                  placeholder={`Enter word ${idx + 1}`}
                  value={verifyWords[idx] || ''}
                  onChange={(e) => setVerifyWords({ ...verifyWords, [idx]: e.target.value })}
                />
              </div>
            ))}

            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-4 text-sm text-amber-900">
                <p>
                  <strong>Why verify?</strong> This ensures your backup is correct and you can recover your vault
                  if needed. Check your backup and enter the exact words.
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('backup')} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleVerify}
                disabled={!verifyWords[2] || !verifyWords[5] || !verifyWords[8]}
                className="flex-1"
              >
                Complete Setup
              </Button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-600 mb-2">Vault Created Successfully!</h3>
              <p className="text-muted-foreground">
                Your seed vault "{label}" is now securely encrypted
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
