# 🚀 One-Click Deployment

Get OxSig running in production in under 10 minutes.

---

## Option 1: Vercel (Fastest - 5 minutes)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Ready for production"
git push origin main
```

### Step 2: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Select your GitHub repo
4. Click "Deploy"

**Done!** Your app is live at `https://your-app.vercel.app`

### Optional: Add Custom Domain
1. In Vercel dashboard → Settings → Domains
2. Add your domain (e.g., `oxsig.yourdomain.com`)
3. Update DNS records as shown
4. SSL certificate auto-configured

---

## Option 2: Railway (With Database - 10 minutes)

### One Command Deploy:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up

# Add PostgreSQL database
railway add

# Done!
```

Your app + database deployed with automatic HTTPS.

---

## Option 3: Docker (Self-Hosted)

### One Command:
```bash
# Build and run
docker build -t oxsig . && docker run -p 3000:3000 oxsig
```

Access at `http://localhost:3000`

---

## Option 4: Static Export (For Air-Gapped)

```bash
# Build static version
pnpm build
pnpm export

# Copy 'out' folder to any web server
# No Node.js needed on production server!
```

Serve with:
- Apache
- Nginx  
- Python: `python -m http.server 3000`
- PHP: `php -S 0.0.0.0:3000`

---

## Post-Deployment Checklist

After deployment, enable features:

### 1. Test on Mobile
- Open deployed URL on phone
- Tap "Install App" (PWA prompt)
- Test biometric login
- Test offline mode

### 2. Configure Features
- Visit `/features` page
- Enable biometric authentication
- Test voice commands
- Test QR code generation

### 3. Security Setup
- Add `.env.local` with secrets
- Enable rate limiting
- Configure CSP headers
- Set up monitoring

---

## Quick Links

**Vercel Deploy:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/oxsig)

**Railway Deploy:** [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/oxsig)

**Netlify Deploy:** [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/oxsig)

---

## Need Help?

- See `PRODUCTION_DEPLOYMENT.md` for detailed guide
- Check `README.md` for development setup
- Open issue on GitHub for problems
