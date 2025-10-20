"use client";

import * as React from "react";
import { 
  Lock, Unlock, Upload, Download, Trash2, Eye, EyeOff, 
  Shield, File, FileText, Image, Video, Music, Archive,
  Plus, Search, Filter, HardDrive, CheckCircle2, AlertTriangle, Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  storeSecureFile,
  retrieveSecureFile,
  getStoredFiles,
  deleteSecureFile,
  getStorageStats,
  exportSecureFile,
  formatFileSize,
  formatTimestamp,
  type SecureFile,
  type StorageStats
} from "@/lib/storage/secure-storage";

export default function SecureStoragePage() {
  const [files, setFiles] = React.useState<SecureFile[]>([]);
  const [stats, setStats] = React.useState<StorageStats>({ totalFiles: 0, totalSize: 0, encryptedFiles: 0 });
  const [selectedFile, setSelectedFile] = React.useState<SecureFile | null>(null);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [showUploadDialog, setShowUploadDialog] = React.useState(false);
  const [showDecryptDialog, setShowDecryptDialog] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [tags, setTags] = React.useState("");
  const [description, setDescription] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load files on mount
  React.useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    const storedFiles = await getStoredFiles();
    setFiles(storedFiles);
    const newStats = await getStorageStats();
    setStats(newStats);
  };

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    const file = fileList[0];
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast.error('File too large', {
        description: 'Maximum file size is 50MB'
      });
      return;
    }
    
    setUploadFile(file);
    setShowUploadDialog(true);
  };

  const handleUpload = async () => {
    if (!uploadFile || !password) {
      toast.error('Please select a file and enter a password');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const secureFile = await storeSecureFile(uploadFile, password, tagList, description);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      toast.success('File encrypted and stored securely!', {
        description: `${uploadFile.name} is now protected`
      });

      await loadFiles();
      setShowUploadDialog(false);
      setPassword("");
      setTags("");
      setDescription("");
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = (file: SecureFile) => {
    setSelectedFile(file);
    setShowDecryptDialog(true);
  };

  const handleDelete = async (file: SecureFile) => {
    if (confirm(`Delete ${file.name}? This action cannot be undone.`)) {
      const success = await deleteSecureFile(file.id);
      if (success) {
        toast.success('File deleted successfully');
        await loadFiles();
      } else {
        toast.error('Failed to delete file');
      }
    }
  };

  const handleExport = async () => {
    if (!selectedFile || !password) return;

    try {
      await exportSecureFile(selectedFile.id, password);
      toast.success('File downloaded successfully!');
      setShowDecryptDialog(false);
      setPassword("");
      setSelectedFile(null);
    } catch (error) {
      toast.error('Export failed', {
        description: 'Incorrect password or corrupted file'
      });
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('video/')) return Video;
    if (type.startsWith('audio/')) return Music;
    if (type.includes('zip') || type.includes('tar')) return Archive;
    if (type.includes('text') || type.includes('document')) return FileText;
    return File;
  };

  const filteredFiles = React.useMemo(() => {
    if (!searchQuery) return files;
    const query = searchQuery.toLowerCase();
    return files.filter(f => 
      f.name.toLowerCase().includes(query) ||
      f.description?.toLowerCase().includes(query) ||
      f.tags?.some(t => t.toLowerCase().includes(query))
    );
  }, [files, searchQuery]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-green-600">
            Secure Storage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Encrypted file storage with client-side encryption
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            Encrypted
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            Zero-Knowledge
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Files</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalFiles}</p>
              </div>
              <File className="h-8 w-8 text-blue-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Storage Used</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatFileSize(stats.totalSize)}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Encrypted</p>
                <p className="text-2xl font-bold text-green-600">{stats.encryptedFiles}</p>
              </div>
              <Lock className="h-8 w-8 text-green-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Security</p>
                <p className="text-2xl font-bold text-emerald-600">100%</p>
              </div>
              <Shield className="h-8 w-8 text-emerald-600/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Files List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Upload Button & Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  accept="*/*"
                />
                <Button 
                  className="flex-1 gap-2" 
                  size="lg"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="h-5 w-5" />
                  Upload & Encrypt File
                </Button>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-11"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files Grid */}
          {filteredFiles.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mb-4">
                  <Lock className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Files Yet</h3>
                <p className="text-muted-foreground mb-4 max-w-sm">
                  Upload and encrypt your sensitive files with client-side encryption
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload First File
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredFiles.map((file) => {
                const FileIcon = getFileIcon(file.type);
                return (
                  <Card key={file.id} className="hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start gap-4">
                        <div className={`h-12 w-12 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0`}>
                          <FileIcon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate">{file.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • {formatTimestamp(file.timestamp)}
                          </p>
                          {file.description && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {file.description}
                            </p>
                          )}
                          {file.tags && file.tags.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {file.tags.map((tag, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(file)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(file)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                Security Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Client-Side Encryption</p>
                  <p className="text-xs text-muted-foreground">Files encrypted in your browser</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Zero-Knowledge</p>
                  <p className="text-xs text-muted-foreground">Only you have the encryption key</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Local Storage</p>
                  <p className="text-xs text-muted-foreground">Files stored locally on your device</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">File Integrity</p>
                  <p className="text-xs text-muted-foreground">Hash verification for tampering detection</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Store your passwords securely - they cannot be recovered</p>
              <p>• Files are stored in browser local storage</p>
              <p>• Clear browser data will delete encrypted files</p>
              <p>• Recommended: Export backup copies regularly</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encrypt & Upload File</DialogTitle>
            <DialogDescription>
              Enter a strong password to encrypt your file. You'll need this password to decrypt and access the file later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Encryption Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong password"
                  disabled={isUploading}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., confidential, work, backup"
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                disabled={isUploading}
                rows={3}
              />
            </div>
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Encrypting...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!password || isUploading}>
              <Lock className="h-4 w-4 mr-2" />
              Encrypt & Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decrypt Dialog */}
      <Dialog open={showDecryptDialog} onOpenChange={setShowDecryptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decrypt File</DialogTitle>
            <DialogDescription>
              Enter the password you used to encrypt this file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">{selectedFile?.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedFile && formatFileSize(selectedFile.size)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="decrypt-password">Password</Label>
              <div className="relative">
                <Input
                  id="decrypt-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter decryption password"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDecryptDialog(false);
              setPassword("");
              setSelectedFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!password}>
              <Unlock className="h-4 w-4 mr-2" />
              Decrypt & Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
