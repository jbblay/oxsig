# 🚂 Railway Deployment - Quick Start

## ⚡ Deploy Now (5 Minutes)

### 1️⃣ Prerequisites
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

### 2️⃣ Deploy
```bash
cd oxsig-backend
railway init
railway up
```

### 3️⃣ Configure
```bash
# Set JWT secret (required if using auth)
railway variables set JWT_SECRET=$(openssl rand -base64 32)

# Optional: Enable authentication
railway variables set WS_REQUIRE_AUTH=true
```

### 4️⃣ Get Your URL
```bash
railway domain
# Output: https://oxsig-backend-production-xxxx.up.railway.app
```

## ✅ Deployment Checklist

- [ ] Railway CLI installed
- [ ] Logged in to Railway (`railway login`)
- [ ] In `oxsig-backend/` directory
- [ ] Committed latest changes to git
- [ ] Railway project initialized (`railway init`)
- [ ] Deployed (`railway up`)
- [ ] Set `JWT_SECRET` variable
- [ ] Generated Railway domain
- [ ] Tested health endpoint
- [ ] WebSocket connection working

## 🧪 Testing Deployment

### 1. Test Health Endpoint
```bash
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "oxsig-ws-gateway",
  "version": "0.1.0"
}
```

### 2. Test WebSocket
```bash
# Install websocat
cargo install websocat

# Connect
websocat wss://your-app.railway.app/ws

# Send ping
{"type":"ping"}

# Should receive
{"type":"pong"}
```

### 3. Check Metrics
```bash
curl https://your-app.railway.app/metrics
```

## 🔧 Common Issues & Fixes

### Issue: Build Fails
**Error:** `Dockerfile.production not found`

**Fix:**
```bash
# Ensure you're in the right directory
cd oxsig-backend
ls -la Dockerfile.production

# If missing, check it wasn't .gitignored
git add -f Dockerfile.production
git commit -m "Add production Dockerfile"
railway up
```

### Issue: Health Check Fails
**Error:** Railway shows "Unhealthy"

**Fix:**
```bash
# Check logs
railway logs

# Common causes:
# 1. App not binding to 0.0.0.0
# 2. Using wrong port (Railway sets PORT env var)
# 3. Health endpoint not responding

# Verify in logs you see:
# "✓ WebSocket gateway listening on 0.0.0.0:8080"
```

### Issue: Connection Refused
**Error:** WebSocket connection fails from frontend

**Fix:**
1. Use `wss://` not `ws://` in production
2. Check Railway domain is correct
3. Verify CORS allows your frontend domain
4. Test with curl first:
   ```bash
   curl https://your-app.railway.app/health
   ```

### Issue: 401 Unauthorized
**Error:** WebSocket returns 401

**Fix:**
```bash
# Check auth setting
railway variables get WS_REQUIRE_AUTH

# If true, you need JWT token:
wss://your-app.railway.app/ws?token=YOUR_JWT_TOKEN

# Or disable auth for testing:
railway variables set WS_REQUIRE_AUTH=false
```

## 📊 Monitoring

### View Real-time Logs
```bash
railway logs --follow
```

### Check Resource Usage
```bash
railway status
```

### Railway Dashboard
1. Go to https://railway.app/project/your-project
2. Click on your service
3. View metrics, logs, deployments

## 🔄 Updates

### Auto-Deploy from Git
```bash
# Push to main branch
git push origin main

# Railway auto-deploys
```

### Manual Deploy
```bash
railway up
```

### Rollback
```bash
# In Railway dashboard:
# Deployments → Click previous deployment → Rollback
```

## 🌐 Connect Frontend

### Vercel
```bash
# In Vercel dashboard, add environment variable:
NEXT_PUBLIC_WS_URL=wss://your-app.railway.app/ws
```

### Netlify
```bash
# In Netlify dashboard, add environment variable:
NEXT_PUBLIC_WS_URL=wss://your-app.railway.app/ws
```

### Local Development
```bash
# .env.local
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

## 💰 Cost Optimization

Railway free tier includes:
- 500 hours/month
- 512MB RAM
- Shared CPU

Tips:
1. Enable auto-sleep (Railway dashboard → Settings)
2. Monitor with `railway status`
3. Optimize health check interval

## 🆘 Getting Help

### Check Logs First
```bash
railway logs --tail 100
```

### Common Log Messages

✅ **Success:**
```
🚀 Starting OxSig WebSocket Gateway v0.1.0
✓ Configuration loaded
✓ Metrics initialized
✓ WebSocket gateway listening on 0.0.0.0:8080
```

❌ **Error:**
```
# Port binding error
Error: Address already in use

# Fix: Railway sets PORT, don't override
```

### Debug Checklist
- [ ] Check Railway logs
- [ ] Verify environment variables
- [ ] Test health endpoint
- [ ] Check build completed successfully
- [ ] Verify domain is accessible
- [ ] Test with simple curl first
- [ ] Then test WebSocket

## 📚 Additional Resources

- [Railway Docs](https://docs.railway.app/)
- [OxSig Backend README](./README.md)
- [Environment Variables](./.env.example)

---

**Ready to deploy? Run:** `railway up` 🚀
