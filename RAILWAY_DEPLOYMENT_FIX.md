# 🚂 Railway Deployment Fix - Manual Configuration Required

## ❌ Problem

Railway is building from the **root directory** which tries to build ALL packages (including Rust backend).

## ✅ Solution

You need to set the **Root Directory** in Railway's dashboard to `packages/frontend`.

---

## 📋 Step-by-Step Fix

### **Option 1: Set Root Directory in Railway Dashboard (EASIEST)**

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Settings** tab
4. Scroll to **Build & Deploy** section
5. Set **Root Directory** to: `packages/frontend`
6. Click **Save**
7. Click **Deploy** → **Redeploy**

**This tells Railway to ONLY look at the frontend package!**

---

### **Option 2: Create Separate Railway Service**

If you can't change root directory:

1. Go to Railway dashboard
2. Click **+ New** → **Empty Service**
3. Connect to GitHub repo
4. **Important Settings:**
   - **Root Directory**: `packages/frontend`
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm start`
5. Deploy!

---

### **Option 3: Use Railway CLI**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set root directory
railway variables set ROOT_DIRECTORY=packages/frontend

# Deploy
railway up
```

---

## 🔧 Environment Variables (Optional)

If you need backend connection:

```bash
NEXT_PUBLIC_WS_URL=wss://your-backend.railway.app/ws
NEXT_PUBLIC_API_URL=https://your-api.railway.app
NODE_ENV=production
```

---

## ✅ Verification

After deploying, you should see:

```
✓ Building frontend package...
✓ Next.js compiled successfully
✓ Deployment successful
```

**URL**: `https://your-project.up.railway.app`

---

## 🚨 If Still Failing

Railway might be caching old builds. Try:

1. **Settings** → **Danger Zone** → **Clear Build Cache**
2. **Redeploy**

Or delete the service and create a new one with `packages/frontend` as root directory from the start.

---

## 💡 Alternative: Use Vercel Instead

Railway is great for backends, but for Next.js frontend, **Vercel is easier**:

```bash
# Just run this in project root
vercel --prod
```

Vercel auto-detects the `vercel.json` config and deploys frontend only! ✨

No manual configuration needed.
