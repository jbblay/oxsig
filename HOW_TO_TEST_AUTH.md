# How to Test Full Authentication - EASY VERSION

## 🚀 Quick Start (3 Steps)

### Step 1: Start the Server
```bash
cd oxsig-frontend
pnpm dev
```

Wait for:
```
╔════════════════════════════════════════════════════════════╗
║                    OxSig Server Ready                      ║
║  Next.js:     http://DESKTOP-CQHCG4L:3000                  ║
╚════════════════════════════════════════════════════════════╝
```

### Step 2: Open the Test Page
**Go to:** `http://localhost:3000/simple-auth-test`

### Step 3: Test Authentication
1. **Enter email:** `test@example.com`
2. **Enter password:** `SecurePass123!`
3. **Click "Register"** ← Creates your account
4. **Click "Login"** ← Logs you in
5. **Success!** ← You'll be redirected to `/profile`

---

## 🎯 That's It!

The test page has everything built-in:
- ✅ Registration form
- ✅ Login form  
- ✅ Logout button
- ✅ Links to protected routes
- ✅ Clear error messages
- ✅ Step-by-step instructions

---

## 🔍 What to Check

### After Clicking "Register":
- Should see: `✅ Registration successful! User: test@example.com`
- User is saved to PostgreSQL database

### After Clicking "Login":
- Should see: `✅ Login successful! Welcome test@example.com`
- JWT cookies are set
- Auto-redirect to `/profile` page

### Check Cookies (DevTools):
1. Press **F12** to open DevTools
2. Go to **Application** tab
3. Click **Cookies** → `http://localhost:3000`
4. You should see:
   - `accessToken` (httpOnly, 15 min expiry)
   - `refreshToken` (httpOnly, 7 day expiry)

---

## 🧪 Test Protected Routes

After logging in, click these buttons on the test page:
- **→ /profile** - Your user profile
- **→ /vault** - Document vault
- **→ /sign** - Document signing
- **→ API /users/me** - Raw API response

**Without login:** You'll get 401 Unauthorized  
**With login:** Pages load successfully ✅

---

## 🐛 Common Issues

### Server not running?
```bash
cd oxsig-frontend
pnpm dev
```

### Page not found?
Make sure you're going to: `http://localhost:3000/simple-auth-test`  
(NOT `/auth-test` - that's a different page)

### Database error?
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart if needed
docker-compose restart postgres
```

### Rate limit hit?
Wait 1 minute, then try again. Rate limits:
- Register: 3 attempts/minute
- Login: 5 attempts/minute

---

## Common Issues & Solutions

### ❌ "Connection refused" when accessing localhost:3000
**Solution:** Server isn't running. Run `pnpm dev`

### ❌ "404 Not Found" on /auth-test
**Solution:** Page might not exist. Check if file exists at `src/app/auth-test/page.tsx`

### ❌ Register button does nothing
**Solution:** 
1. Open DevTools Console (F12 → Console tab)
2. Look for JavaScript errors
3. Check Network tab for failed requests

### ❌ "Cannot connect to database"
**Solution:** 
1. Check Docker is running: `docker ps`
2. Check PostgreSQL is running: `docker ps | grep postgres`
3. Restart services: `docker-compose restart postgres`

### ❌ Can't see cookies
**Solution:** 
- Make sure you're checking `http://localhost:3000` (not `127.0.0.1`)
- httpOnly cookies won't show in JavaScript console (that's by design)
- Check Application → Cookies in DevTools

---

## Quick Test Script

Copy and run this in your browser console (F12 → Console) while on `http://localhost:3000/auth-test`:

```javascript
// Test registration
async function testAuth() {
  console.log('🧪 Testing Registration...');
  
  const registerRes = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `test-${Date.now()}@example.com`,
      password: 'SecurePass123!'
    })
  });
  
  const registerData = await registerRes.json();
  console.log('✅ Register response:', registerData);
  
  if (registerRes.ok) {
    console.log('🧪 Testing Login...');
    
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registerData.user.email,
        password: 'SecurePass123!'
      })
    });
    
    const loginData = await loginRes.json();
    console.log('✅ Login response:', loginData);
    
    if (loginRes.ok) {
      console.log('✅ AUTH TEST PASSED! You are now logged in.');
      console.log('Try accessing: http://localhost:3000/profile');
    }
  }
}

testAuth();
```

---

## Visual Flow

```
1. Browser → http://localhost:3000/auth-test
           ↓
2. Fill form → Email + Password
           ↓
3. Click Register → POST /api/auth/register
           ↓
4. Success → User created in PostgreSQL
           ↓
5. Click Login → POST /api/auth/login
           ↓
6. Success → JWT cookies set
           ↓
7. Access /profile → Middleware checks JWT
           ↓
8. Authorized → Page loads ✅
```

---

## Need Help?

If you're still stuck, tell me:
1. What URL are you accessing?
2. What do you see on the page?
3. Any errors in the browser console? (F12 → Console)
4. Is the server running? (check terminal output)

I'll help you debug! 🚀
