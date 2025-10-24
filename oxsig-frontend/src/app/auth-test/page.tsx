'use client';

import { useAuth } from '@/lib/auth/use-auth';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AuthTestPage() {
  const { user, isAuthenticated, isLoading, login, register, logout, refresh } = useAuth();
  
  // Registration form
  const [regPublicKey, setRegPublicKey] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  
  // Login form
  const [loginPublicKey, setLoginPublicKey] = useState('');
  
  // Update profile form
  const [updateDisplayName, setUpdateDisplayName] = useState('');
  const [updateBio, setUpdateBio] = useState('');
  
  // Status messages
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    try {
      setError('');
      setMessage('Registering...');
      
      const publicKey = regPublicKey || `did:key:test-${Date.now()}`;
      const signature = `sig-${Date.now()}`;
      
      await register({
        publicKey,
        displayName: regDisplayName,
        email: regEmail,
        signature
      });
      
      setMessage(`✅ Registered successfully! Public Key: ${publicKey}`);
      setRegPublicKey('');
      setRegDisplayName('');
      setRegEmail('');
    } catch (err: any) {
      setError(`❌ Registration failed: ${err.message}`);
      setMessage('');
    }
  };

  const handleLogin = async () => {
    try {
      setError('');
      setMessage('Logging in...');
      
      const publicKey = loginPublicKey || user?.publicKey;
      if (!publicKey) {
        setError('❌ Please provide a public key');
        return;
      }
      
      const signature = `sig-${Date.now()}`;
      const challenge = `Login to OxSig at ${Date.now()}`;
      
      await login(publicKey, signature, challenge);
      
      setMessage('✅ Logged in successfully!');
      setLoginPublicKey('');
    } catch (err: any) {
      setError(`❌ Login failed: ${err.message}`);
      setMessage('');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setError('');
      setMessage('Updating profile...');
      
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          displayName: updateDisplayName || undefined,
          bio: updateBio || undefined,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await response.json();
      setMessage('✅ Profile updated successfully!');
      setUpdateDisplayName('');
      setUpdateBio('');
      
      // Refresh user data
      await refresh();
    } catch (err: any) {
      setError(`❌ Update failed: ${err.message}`);
      setMessage('');
    }
  };

  const handleRefresh = async () => {
    try {
      setError('');
      setMessage('Refreshing token...');
      await refresh();
      setMessage('✅ Token refreshed successfully!');
    } catch (err: any) {
      setError(`❌ Refresh failed: ${err.message}`);
      setMessage('');
    }
  };

  const handleLogout = async () => {
    try {
      setError('');
      setMessage('Logging out...');
      await logout();
      setMessage('✅ Logged out successfully!');
    } catch (err: any) {
      setError(`❌ Logout failed: ${err.message}`);
      setMessage('');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center">Loading authentication state...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔐 OxSig Authentication Test</CardTitle>
          <CardDescription>
            Test the complete authentication system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status */}
            <div className="p-4 rounded-lg bg-muted">
              <p className="font-semibold mb-2">Authentication Status:</p>
              <p className="text-sm">
                {isAuthenticated ? (
                  <span className="text-green-600">✅ Authenticated</span>
                ) : (
                  <span className="text-red-600">❌ Not Authenticated</span>
                )}
              </p>
              {user && (
                <div className="mt-3 text-sm space-y-1">
                  <p><strong>ID:</strong> {user.id}</p>
                  <p><strong>Display Name:</strong> {user.displayName || 'N/A'}</p>
                  <p><strong>Email:</strong> {user.email || 'N/A'}</p>
                  <p><strong>Public Key:</strong> {user.publicKey}</p>
                </div>
              )}
            </div>

            {/* Messages */}
            {message && (
              <div className="p-4 rounded-lg bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
                {message}
              </div>
            )}
            {error && (
              <div className="p-4 rounded-lg bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!isAuthenticated ? (
        <Tabs defaultValue="register" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="login">Login</TabsTrigger>
          </TabsList>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Register New User</CardTitle>
                <CardDescription>
                  Leave fields empty for auto-generated test data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-publicKey">Public Key (optional)</Label>
                  <Input
                    id="reg-publicKey"
                    placeholder="did:key:z6Mkh... (auto-generated if empty)"
                    value={regPublicKey}
                    onChange={(e) => setRegPublicKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-displayName">Display Name</Label>
                  <Input
                    id="reg-displayName"
                    placeholder="John Doe"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="john@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
                <Button onClick={handleRegister} className="w-full">
                  Register
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>
                  Enter your public key to login
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-publicKey">Public Key</Label>
                  <Input
                    id="login-publicKey"
                    placeholder="did:key:z6Mkh..."
                    value={loginPublicKey}
                    onChange={(e) => setLoginPublicKey(e.target.value)}
                  />
                </div>
                <Button onClick={handleLogin} className="w-full">
                  Login
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>User Actions</CardTitle>
            <CardDescription>
              Manage your profile and session
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Update Profile */}
            <div className="space-y-4">
              <h3 className="font-semibold">Update Profile</h3>
              <div className="space-y-2">
                <Label htmlFor="update-displayName">Display Name</Label>
                <Input
                  id="update-displayName"
                  placeholder={user?.displayName || 'New display name'}
                  value={updateDisplayName}
                  onChange={(e) => setUpdateDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="update-bio">Bio</Label>
                <Textarea
                  id="update-bio"
                  placeholder="Tell us about yourself..."
                  value={updateBio}
                  onChange={(e) => setUpdateBio(e.target.value)}
                />
              </div>
              <Button onClick={handleUpdateProfile} className="w-full">
                Update Profile
              </Button>
            </div>

            {/* Session Actions */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold">Session Management</h3>
              <div className="flex gap-2">
                <Button onClick={handleRefresh} variant="outline" className="flex-1">
                  Refresh Token
                </Button>
                <Button onClick={handleLogout} variant="destructive" className="flex-1">
                  Logout
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Developer Info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>🔧 Developer Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p><strong>Access Token:</strong></p>
            <code className="block p-2 bg-muted rounded text-xs overflow-x-auto">
              {localStorage.getItem('accessToken') || 'Not set'}
            </code>
            <p className="mt-3"><strong>Refresh Token:</strong></p>
            <code className="block p-2 bg-muted rounded text-xs overflow-x-auto">
              {localStorage.getItem('refreshToken') || 'Not set'}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
