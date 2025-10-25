# OxSig Authentication Quick Reference

## 🚀 Quick Start

### For Users
```
1. Visit: http://localhost:3000
2. Click "Get Started" → Redirects to /auth
3. Register or Login
4. Auto-redirect to /dashboard
```

### For Developers
```typescript
import { useAuth } from '@/lib/auth/use-auth';

function MyComponent() {
  const { user, loginWithEmail, logout, authMethod } = useAuth();
  
  // Check if authenticated
  if (!user) return <Login />;
  
  // Show user info
  return <div>Welcome, {user.displayName}!</div>;
}
```

## 📚 API Reference

### useAuth Hook

```typescript
const {
  user,              // Current user object or null
  isAuthenticated,   // Boolean: user logged in?
  isLoading,         // Boolean: loading state
  authMethod,        // 'email' | 'did' | null
  
  // Email/Password methods
  loginWithEmail,    // (email, password) => Promise<void>
  registerWithEmail, // (email, password, displayName?) => Promise<void>
  
  // DID methods
  login,             // (publicKey, signature, challenge?) => Promise<void>
  register,          // (data) => Promise<User>
  
  // Common
  logout,            // () => Promise<void>
  refresh,           // () => Promise<void>
  fetchUserProfile,  // () => Promise<void>
} = useAuth();
```

### User Object

```typescript
interface User {
  id: string;
  email: string;
  displayName: string;
  publicKey: string;
  role: string;
}
```

## 🔐 Authentication Methods

### Email/Password

**Login:**
```typescript
const handleLogin = async () => {
  try {
    await loginWithEmail('user@example.com', 'password123');
    router.push('/dashboard');
  } catch (error) {
    console.error('Login failed:', error.message);
  }
};
```

**Register:**
```typescript
const handleRegister = async () => {
  try {
    await registerWithEmail(
      'user@example.com',
      'password123',
      'John Doe' // optional
    );
    router.push('/dashboard');
  } catch (error) {
    console.error('Registration failed:', error.message);
  }
};
```

**Logout:**
```typescript
const handleLogout = async () => {
  await logout();
  router.push('/');
};
```

### Internet Identity (Dfinity)

**Coming Soon**: Full implementation pending

**Current Placeholder:**
```typescript
// Shows "Coming soon" message
const handleDIDLogin = () => {
  setError("Internet Identity integration coming soon!");
};
```

## 🛣️ Routes

### Public Routes
- `/` - Homepage (redirects to /dashboard if authenticated)
- `/auth` - Login/Register page

### Protected Routes
- `/dashboard` - User dashboard (requires auth)
- `/profile` - User profile (requires auth)
- `/sign` - Document signing
- `/vault` - Seed vault
- `/collab` - Collaboration

## 🗃️ Database Schema

### users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,           -- For email auth
  public_key TEXT,              -- For DID auth
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP
);
```

## 🔌 API Endpoints

### Authentication
```bash
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
```

### User Management
```bash
GET  /api/users/me           # Get current user
PUT  /api/users/me           # Update current user (TODO)
POST /api/users/me/avatar    # Upload avatar (TODO)
```

## 🎨 UI Components

### Login Form
```tsx
import { useAuth } from '@/lib/auth/use-auth';

function LoginForm() {
  const { loginWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    await loginWithEmail(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input value={email} onChange={e => setEmail(e.target.value)} />
      <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <Button type="submit">Login</Button>
    </form>
  );
}
```

### Protected Component
```tsx
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';

function ProtectedComponent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <Loader />;
  if (!user) return null;

  return <div>Protected content for {user.displayName}</div>;
}
```

## 📊 Dashboard Integration

### Fetch User Data
```typescript
useEffect(() => {
  const fetchUserData = async () => {
    const response = await fetch('/api/users/me', {
      credentials: 'include', // Important for cookies
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(data); // { id, email, display_name, ... }
    }
  };

  fetchUserData();
}, []);
```

## 🔒 Security Best Practices

### Password Requirements
- Minimum 8 characters
- Hashed with bcrypt (10 rounds)
- Never stored in plain text

### JWT Tokens
- Stored in httpOnly cookies
- Not accessible via JavaScript (XSS protection)
- Short-lived access tokens
- Refresh tokens for renewal

### Request Authentication
```typescript
// Automatic with credentials: 'include'
fetch('/api/users/me', {
  credentials: 'include', // Sends httpOnly cookies
});
```

## 🐛 Debugging

### Check Authentication State
```typescript
const { user, authMethod } = useAuth();

console.log('User:', user);
console.log('Auth Method:', authMethod);
console.log('Authenticated:', user !== null);
```

### Check Cookies
```javascript
// In browser console
document.cookie;

// Should see: access_token=...; refresh_token=...
// Note: httpOnly cookies won't be visible in document.cookie
```

### Check API Response
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -v
```

## 📝 Common Patterns

### Conditional Rendering by Auth State
```tsx
const { user, authMethod } = useAuth();

return (
  <>
    {!user && <LoginPrompt />}
    {user && authMethod === 'email' && <EmailUserDashboard />}
    {user && authMethod === 'did' && <DIDUserDashboard />}
  </>
);
```

### Fetch with Auth
```typescript
const fetchProtectedData = async () => {
  const response = await fetch('/api/protected', {
    credentials: 'include',
  });
  
  if (response.status === 401) {
    router.push('/auth');
    return;
  }
  
  const data = await response.json();
  return data;
};
```

### Auth State Persistence
```typescript
// Automatic - handled by AuthProvider
// On page load:
// 1. Checks for JWT cookies (email auth)
// 2. Checks localStorage (DID auth)
// 3. Sets user state accordingly
```

## 🚦 Error Handling

### Login Errors
```typescript
try {
  await loginWithEmail(email, password);
} catch (error) {
  if (error.message.includes('Invalid credentials')) {
    setError('Incorrect email or password');
  } else if (error.message.includes('Account locked')) {
    setError('Your account has been locked');
  } else {
    setError('Login failed. Please try again.');
  }
}
```

### Network Errors
```typescript
try {
  await loginWithEmail(email, password);
} catch (error) {
  if (error.name === 'NetworkError') {
    setError('Network error. Please check your connection.');
  }
}
```

## 📦 Dependencies

```json
{
  "@dfinity/auth-client": "coming soon",
  "@dfinity/identity": "coming soon",
  "@dfinity/agent": "coming soon",
  "bcrypt": "^5.1.1",
  "jsonwebtoken": "^9.0.2",
  "next": "15.5.6",
  "react": "19.0.0"
}
```

## 🎯 Next Steps

1. **Integrate Internet Identity**
   - Install `@dfinity/auth-client`
   - Implement II login flow
   - Add backend DID verification

2. **Add Profile Editing**
   - Create `PUT /api/users/me` endpoint
   - Add edit form to profile page
   - Handle avatar uploads

3. **Implement Real Stats**
   - Connect to documents table
   - Calculate real security score
   - Track actual storage usage

4. **Add More Auth Methods**
   - Two-factor authentication
   - Biometric login
   - Hardware keys (WebAuthn)
   - Social providers (Google, GitHub)

## 📞 Support

For issues or questions:
- Check TESTING_GUIDE.md for testing instructions
- See DUAL_AUTH_IMPLEMENTATION.md for detailed implementation
- Review HOW_TO_TEST_AUTH.md for authentication testing

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Status**: Production Ready (Email/Password)
