'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, 
  Plus, 
  Eye, 
  EyeOff, 
  Lock,
  Unlock,
  Copy,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Users,
  Calendar
} from 'lucide-react';
import { SeedVaultCreator } from './SeedVaultCreator';
import { getAllVaults, deleteVault, updateVaultAccess, getVaultStats } from '@/lib/db/vaults';
import { decryptSeed, type SeedVault } from '@/lib/vault/seed-vault';
import { format } from 'date-fns';

export function VaultManager() {
  const [vaults, setVaults] = useState<SeedVault[]>([]);
  const [showCreator, setShowCreator] = useState(false);
  const [selectedVault, setSelectedVault] = useState<SeedVault | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockedMnemonic, setUnlockedMnemonic] = useState<string[] | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadVaults();
    loadStats();
  }, []);

  async function loadVaults() {
    const allVaults = await getAllVaults();
    setVaults(allVaults);
  }

  async function loadStats() {
    const vaultStats = await getVaultStats();
    setStats(vaultStats);
  }

  async function handleUnlock() {
    if (!selectedVault || !unlockPassword) return;

    try {
      const mnemonic = await decryptSeed(selectedVault.encryptedSeed, unlockPassword);
      setUnlockedMnemonic(mnemonic);
      await updateVaultAccess(selectedVault.id);
      setUnlockPassword('');
    } catch (error) {
      console.error('Failed to unlock vault:', error);
      alert('Incorrect password');
    }
  }

  function handleCloseUnlock() {
    setShowUnlock(false);
    setSelectedVault(null);
    setUnlockedMnemonic(null);
    setUnlockPassword('');
  }

  async function handleDelete(vaultId: string) {
    if (confirm('Are you sure? This cannot be undone if you haven\'t backed up your seed phrase!')) {
      await deleteVault(vaultId);
      loadVaults();
      loadStats();
    }
  }

  function handleCopyMnemonic() {
    if (unlockedMnemonic) {
      navigator.clipboard.writeText(unlockedMnemonic.join(' '));
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Vaults</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Biometric Protected</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-blue-500" />
                <div className="text-2xl font-bold">{stats.withBiometric}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Guardian Backup</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <div className="text-2xl font-bold">{stats.withGuardians}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Oldest Vault</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div className="text-sm font-semibold">
                  {stats.oldestVault ? format(new Date(stats.oldestVault), 'MMM d, yyyy') : 'N/A'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Seed Vaults</h2>
          <p className="text-muted-foreground">Manage your encrypted recovery phrases</p>
        </div>
        <Button onClick={() => setShowCreator(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Vault
        </Button>
      </div>

      {/* Vaults Grid */}
      {vaults.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No Vaults Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first seed vault to get started</p>
            <Button onClick={() => setShowCreator(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Vault
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vaults.map((vault) => (
            <Card key={vault.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{vault.metadata.label}</span>
                  <Badge variant="outline">{vault.metadata.wordCount} words</Badge>
                </CardTitle>
                <CardDescription>
                  Created {format(new Date(vault.createdAt), 'MMM d, yyyy')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Recovery Methods */}
                <div className="flex flex-wrap gap-2">
                  {vault.recoveryMethods.map((method) => (
                    <Badge key={method.id} variant="secondary" className="text-xs">
                      {method.type === 'password' && <Lock className="h-3 w-3 mr-1" />}
                      {method.type === 'biometric' && <Fingerprint className="h-3 w-3 mr-1" />}
                      {method.type === 'guardian' && <Users className="h-3 w-3 mr-1" />}
                      {method.type}
                    </Badge>
                  ))}
                </div>

                {/* Security Indicators */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {vault.metadata.biometricWrapped && (
                    <div className="flex items-center gap-1">
                      <Fingerprint className="h-4 w-4 text-blue-500" />
                      <span>Biometric</span>
                    </div>
                  )}
                  {vault.metadata.guardianBackup && (
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-green-500" />
                      <span>Guardians</span>
                    </div>
                  )}
                </div>

                {/* Last Accessed */}
                {vault.lastAccessed && (
                  <p className="text-xs text-muted-foreground">
                    Last accessed: {format(new Date(vault.lastAccessed), 'MMM d, h:mm a')}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowUnlock(true);
                    }}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(vault.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Creator Modal */}
      <SeedVaultCreator
        open={showCreator}
        onClose={() => setShowCreator(false)}
        onSuccess={() => {
          setShowCreator(false);
          loadVaults();
          loadStats();
        }}
      />

      {/* Unlock Modal */}
      <Dialog open={showUnlock} onOpenChange={handleCloseUnlock}>
        <DialogContent {...{className: "max-w-2xl"} as any}>
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Unlock Vault: {selectedVault?.metadata.label}
              </div>
            </DialogTitle>
            <DialogDescription>
              Enter your master password to view the seed phrase
            </DialogDescription>
          </DialogHeader>

          {!unlockedMnemonic ? (
            <div className="space-y-4">
              <Input
                type="password"
                placeholder="Master password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />

              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="pt-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Security Reminder:</p>
                      <p className="mt-1">Make sure you're in a private location before viewing your seed phrase.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseUnlock} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleUnlock} disabled={!unlockPassword} className="flex-1">
                  <Unlock className="h-4 w-4 mr-2" />
                  Unlock
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-purple-900">Seed Phrase</h3>
                    <Badge variant="outline">{unlockedMnemonic.length} words</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {unlockedMnemonic.map((word, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200"
                      >
                        <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                        <span className="font-mono font-semibold">{word}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyMnemonic}
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All Words
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-red-50 border-red-200">
                <CardContent className="pt-4 text-sm text-red-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Never share these words!</p>
                      <p className="mt-1">Anyone with access to this seed phrase can control your vault.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleCloseUnlock} className="w-full">
                Close & Lock
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
