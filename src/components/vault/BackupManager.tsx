/**
 * Vault Backup UI Components
 * User interface for backup and recovery operations
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Download, 
  Upload, 
  Shield, 
  Trash2, 
  Clock, 
  File, 
  Settings,
  Check,
  X,
  HardDrive,
  Archive
} from 'lucide-react';
import {
  vaultBackup,
  BackupMetadata,
  BackupOptions,
  RestoreOptions,
  BackupProgress,
  BackupProgressCallback
} from '@/lib/vault/backup';

interface BackupDialogProps {
  onBackupComplete?: (metadata: BackupMetadata) => void;
}

export function BackupDialog({ onBackupComplete }: BackupDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [options, setOptions] = useState<BackupOptions>({
    includeIdentities: true,
    includeDocuments: true,
    includeSignatures: true,
    includeKeys: true,
    includeSettings: true,
    includeCollaborations: true,
    compress: true,
    description: ''
  });

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setProgress(null);

    const progressCallback: BackupProgressCallback = (progress) => {
      setProgress(progress);
    };

    try {
      const metadata = await vaultBackup.createBackup(options, progressCallback);
      onBackupComplete?.(metadata);
      setIsOpen(false);
      setProgress(null);
    } catch (error) {
      console.error('Backup failed:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setProgress(null);
    setIsCreating(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Archive className="h-4 w-4" />
          Create Backup
        </Button>
      </DialogTrigger>
      <DialogContent {...{className: "sm:max-w-md"} as any}>
        <DialogHeader>
          <DialogTitle>Create Vault Backup</DialogTitle>
          <DialogDescription>
            Create an encrypted backup of your vault data for safekeeping.
          </DialogDescription>
        </DialogHeader>

        {!isCreating ? (
          <div className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="e.g., Monthly backup before key rotation..."
                value={options.description || ''}
                onChange={(e) => setOptions({ ...options, description: e.target.value })}
                className="min-h-[60px]"
              />
            </div>

            {/* What to include */}
            <div className="space-y-3">
              <Label>What to include:</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'includeIdentities', label: 'Identities', icon: '🆔' },
                  { key: 'includeDocuments', label: 'Documents', icon: '📄' },
                  { key: 'includeSignatures', label: 'Signatures', icon: '✍️' },
                  { key: 'includeKeys', label: 'Keys', icon: '🔐' },
                  { key: 'includeSettings', label: 'Settings', icon: '⚙️' },
                  { key: 'includeCollaborations', label: 'Collaborations', icon: '👥' }
                ].map(({ key, label, icon }) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={key}
                      checked={options[key as keyof BackupOptions] as boolean}
                      onCheckedChange={(checked) => 
                        setOptions({ ...options, [key]: checked })
                      }
                    />
                    <Label htmlFor={key} className="text-sm font-normal">
                      {icon} {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="compress"
                  checked={options.compress}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, compress: !!checked })
                  }
                />
                <Label htmlFor="compress" className="text-sm font-normal">
                  🗜️ Compress backup (recommended)
                </Label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleCreateBackup} className="flex-1 gap-2">
                <Shield className="h-4 w-4" />
                Create Backup
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            {progress && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{progress.message}</span>
                  <span>{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="w-full" />
                {progress.itemsProcessed !== undefined && progress.totalItems && (
                  <div className="text-xs text-muted-foreground text-center">
                    {progress.itemsProcessed} of {progress.totalItems} items processed
                  </div>
                )}
              </div>
            )}

            {progress?.stage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  Close
                </Button>
              </div>
            ) : progress?.stage === 'complete' ? (
              <div className="flex gap-2">
                <Button onClick={handleCancel} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} disabled>
                  Creating backup...
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RestoreDialogProps {
  backup: BackupMetadata;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreComplete?: () => void;
}

export function RestoreDialog({ backup, isOpen, onOpenChange, onRestoreComplete }: RestoreDialogProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [options, setOptions] = useState<RestoreOptions>({
    overwriteExisting: false,
    validateIntegrity: true
  });

  const handleRestore = async () => {
    setIsRestoring(true);
    setProgress(null);

    const progressCallback: BackupProgressCallback = (progress) => {
      setProgress(progress);
    };

    try {
      await vaultBackup.restoreBackup(backup.id, options, progressCallback);
      onRestoreComplete?.();
      onOpenChange(false);
      setProgress(null);
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setProgress(null);
    setIsRestoring(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent {...{className: "sm:max-w-md"} as any}>
        <DialogHeader>
          <DialogTitle>Restore from Backup</DialogTitle>
          <DialogDescription>
            Restore vault data from backup created on {backup.createdAt.toLocaleDateString()}.
          </DialogDescription>
        </DialogHeader>

        {!isRestoring ? (
          <div className="space-y-4">
            {/* Backup info */}
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Files:</span>
                  <span>{backup.fileCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Size:</span>
                  <span>{(backup.totalSize / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Version:</span>
                  <span>v{backup.version}</span>
                </div>
                {backup.description && (
                  <div className="text-sm text-muted-foreground">
                    {backup.description}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="overwrite"
                  checked={options.overwriteExisting}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, overwriteExisting: !!checked })
                  }
                />
                <Label htmlFor="overwrite" className="text-sm font-normal">
                  Overwrite existing data
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="validate"
                  checked={options.validateIntegrity}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, validateIntegrity: !!checked })
                  }
                />
                <Label htmlFor="validate" className="text-sm font-normal">
                  Validate backup integrity
                </Label>
              </div>
            </div>

            {/* Warning */}
            {options.overwriteExisting && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ This will overwrite your current vault data. Make sure you have a recent backup first.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                onClick={handleRestore} 
                variant={options.overwriteExisting ? "destructive" : "default"}
                className="flex-1 gap-2"
              >
                <Upload className="h-4 w-4" />
                Restore
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            {progress && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{progress.message}</span>
                  <span>{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="w-full" />
                {progress.itemsProcessed !== undefined && progress.totalItems && (
                  <div className="text-xs text-muted-foreground text-center">
                    {progress.itemsProcessed} of {progress.totalItems} items restored
                  </div>
                )}
              </div>
            )}

            {progress?.stage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  Close
                </Button>
              </div>
            ) : progress?.stage === 'complete' ? (
              <div className="flex gap-2">
                <Button onClick={handleCancel} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} disabled>
                  Restoring...
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BackupList() {
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupMetadata | null>(null);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      const backupList = await vaultBackup.listBackups();
      setBackups(backupList);
    } catch (error) {
      console.error('Failed to load backups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (backup: BackupMetadata) => {
    try {
      const blob = await vaultBackup.exportBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oxsig-backup-${backup.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export backup');
    }
  };

  const handleDelete = async (backup: BackupMetadata) => {
    if (confirm(`Delete backup from ${backup.createdAt.toLocaleDateString()}?`)) {
      try {
        await vaultBackup.deleteBackup(backup.id);
        await loadBackups();
      } catch (error) {
        console.error('Delete failed:', error);
        alert('Failed to delete backup');
      }
    }
  };

  const handleRestore = (backup: BackupMetadata) => {
    setSelectedBackup(backup);
    setIsRestoreOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Loading backups...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (backups.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <HardDrive className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No backups found</p>
            <p className="text-sm text-muted-foreground">
              Create your first backup to protect your vault data.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {backups.map((backup) => (
          <Card key={backup.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      Backup v{backup.version}
                    </span>
                    <Badge variant="outline">
                      {backup.fileCount} files
                    </Badge>
                    <Badge variant="outline">
                      {(backup.totalSize / 1024).toFixed(1)} KB
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {backup.createdAt.toLocaleDateString()} at {backup.createdAt.toLocaleTimeString()}
                  </div>
                  {backup.description && (
                    <p className="text-sm text-muted-foreground">
                      {backup.description}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(backup)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(backup)}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(backup)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedBackup && (
        <RestoreDialog
          backup={selectedBackup}
          isOpen={isRestoreOpen}
          onOpenChange={setIsRestoreOpen}
          onRestoreComplete={loadBackups}
        />
      )}
    </>
  );
}

export function ImportBackupDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setProgress(null);

    const progressCallback: BackupProgressCallback = (progress) => {
      setProgress(progress);
    };

    try {
      await vaultBackup.importBackup(file, progressCallback);
      setIsOpen(false);
      setProgress(null);
      setFile(null);
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setProgress(null);
    setIsImporting(false);
    setFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import Backup
        </Button>
      </DialogTrigger>
      <DialogContent {...{className: "sm:max-w-md"} as any}>
        <DialogHeader>
          <DialogTitle>Import Backup</DialogTitle>
          <DialogDescription>
            Import a previously exported backup file.
          </DialogDescription>
        </DialogHeader>

        {!isImporting ? (
          <div className="space-y-4">
            {/* File selection */}
            <div className="space-y-2">
              <Label htmlFor="backup-file">Select backup file</Label>
              <Input
                id="backup-file"
                type="file"
                accept=".json"
                onChange={handleFileSelect}
              />
            </div>

            {file && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button 
                onClick={handleImport} 
                disabled={!file}
                className="flex-1 gap-2"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            {progress && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{progress.message}</span>
                  <span>{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="w-full" />
              </div>
            )}

            {progress?.stage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  Close
                </Button>
              </div>
            ) : progress?.stage === 'complete' ? (
              <div className="flex gap-2">
                <Button onClick={handleCancel} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel} disabled>
                  Importing...
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function VaultBackupManager() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBackupComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleRestoreComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Vault Backup & Recovery
          </CardTitle>
          <CardDescription>
            Create encrypted backups of your vault data and restore when needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <BackupDialog onBackupComplete={handleBackupComplete} />
            <ImportBackupDialog />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Backups</CardTitle>
          <CardDescription>
            Your encrypted vault backups stored locally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupList key={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}