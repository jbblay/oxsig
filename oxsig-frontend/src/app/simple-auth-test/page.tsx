'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

export default function SimpleAuthTestPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('Registering...');

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      setMessage(`✅ Registration successful! User: ${data.user.email}`);
      setError('');
      
      // Clear form
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setError(`❌ ${err.message}`);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('Logging in...');

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      setMessage(`✅ Login successful! Welcome ${data.user.email}`);
      setError('');
      
      // Redirect to profile after successful login
      setTimeout(() => {
        router.push('/profile');
      }, 1500);
    } catch (err: any) {
      setError(`❌ ${err.message}`);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        setMessage('✅ Logged out successfully');
        setError('');
      }
    } catch (err: any) {
      setError(`❌ Logout failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>🧪 Simple Auth Testing</CardTitle>
          <CardDescription>
            Test email/password authentication with JWT tokens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Messages */}
          {message && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg">
              {message}
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="test@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                Suggested: <code className="bg-muted px-1 py-0.5 rounded">SecurePass123!</code>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                onClick={handleRegister} 
                disabled={loading || !email || !password}
                className="flex-1"
              >
                {loading ? 'Processing...' : '📝 Register'}
              </Button>
              
              <Button 
                onClick={handleLogin} 
                disabled={loading || !email || !password}
                variant="secondary"
                className="flex-1"
              >
                {loading ? 'Processing...' : '🔐 Login'}
              </Button>
              
              <Button 
                onClick={handleLogout} 
                disabled={loading}
                variant="outline"
              >
                🚪 Logout
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3 pt-6 border-t">
            <h3 className="font-semibold">📋 How to Test:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Enter an email (e.g., <code className="bg-muted px-1 py-0.5 rounded">test@example.com</code>)</li>
              <li>Enter a password (min 8 chars, e.g., <code className="bg-muted px-1 py-0.5 rounded">SecurePass123!</code>)</li>
              <li>Click <strong>"Register"</strong> to create account</li>
              <li>Click <strong>"Login"</strong> to authenticate</li>
              <li>On success, you'll be redirected to <code className="bg-muted px-1 py-0.5 rounded">/profile</code></li>
              <li>Open DevTools → Application → Cookies to see JWT tokens</li>
            </ol>
          </div>

          {/* Protected Routes */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-semibold">🔒 Test Protected Routes (after login):</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/profile')}
              >
                → /profile
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/vault')}
              >
                → /vault
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/sign')}
              >
                → /sign
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/api/users/me')}
              >
                → API /users/me
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              These routes require authentication. Without login, you'll get 401 errors.
            </p>
          </div>

          {/* Developer Info */}
          <div className="space-y-2 pt-4 border-t text-xs text-muted-foreground">
            <p><strong>API Endpoints:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><code>POST /api/auth/register</code> - Create account</li>
              <li><code>POST /api/auth/login</code> - Authenticate</li>
              <li><code>POST /api/auth/logout</code> - Clear session</li>
              <li><code>GET /api/users/me</code> - Get current user</li>
            </ul>
            <p className="pt-2"><strong>Security:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Passwords hashed with bcrypt (10 rounds)</li>
              <li>JWTs signed with Ed25519</li>
              <li>Tokens stored in httpOnly cookies</li>
              <li>Rate limiting: 3 register/min, 5 login/min</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
