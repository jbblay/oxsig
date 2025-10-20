# 🚀 OxSig Deployment Guide

## Quick Deploy Options

### ⚡ One-Click Deployments

#### Vercel (Recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/oxsig)

**Benefits:**
- Global CDN with edge locations
- Automatic HTTPS with custom domains
- Serverless functions for API routes
- Git-based deployments
- Free tier available

**Steps:**
1. Push code to GitHub
2. Connect Vercel to your repository
3. Click "Deploy"
4. Your app is live at `https://your-app.vercel.app`

#### Railway
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/oxsig)

**Benefits:**
- Includes PostgreSQL database
- Automatic HTTPS and custom domains
- Simple pricing model
- Built-in monitoring

#### Netlify
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/oxsig)

**Benefits:**
- Form handling and serverless functions
- Advanced redirect rules
- Split testing capabilities
- Excellent static site performance

## Manual Deployment

### Prerequisites

```bash
# Required tools
Node.js 18+ (LTS recommended)
pnpm 8+ (or npm/yarn)
Git

# For production
Docker (optional)
Domain name (optional)
SSL certificate (automatic with most hosts)
```

### Build Process

```bash
# Clone repository
git clone https://github.com/yourusername/oxsig.git
cd oxsig

# Install dependencies
pnpm install

# Build for production
pnpm build

# Test production build locally
pnpm start
```

### Environment Configuration

Create `.env.local` for production:

```bash
# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_NAME="OxSig"
NEXT_PUBLIC_APP_DESCRIPTION="Quantum-Safe Secure Communications"

# Database (Optional)
DATABASE_URL="postgresql://user:password@host:5432/oxsig"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_KEY="your-service-key"

# Security
NEXTAUTH_SECRET="your-32-character-secret"
NEXTAUTH_URL="https://your-domain.com"

# External Services (Optional)
IPFS_API_KEY="your-ipfs-key"
PUSH_NOTIFICATION_KEY="your-push-key"
ANALYTICS_ID="your-analytics-id"

# Security Headers
CSP_REPORT_URI="https://your-domain.com/api/csp-report"
```

## Platform-Specific Guides

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Configure custom domain (optional)
vercel domains add your-domain.com
```

**Vercel Configuration (`vercel.json`):**
```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up

# Add database
railway add postgresql

# Configure environment variables
railway variables set NODE_ENV=production
```

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g pnpm && pnpm build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  oxsig:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/oxsig
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=oxsig
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Static Export (Air-Gapped)

For maximum security, deploy as static files:

```bash
# Configure for static export
# Add to next.config.ts:
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  }
}

# Build static version
pnpm build

# Files will be in 'out' directory
# Deploy to any web server
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.pem;
    ssl_certificate_key /path/to/private.key;
    
    root /var/www/oxsig/out;
    index index.html;
    
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
    
    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Database Setup

### Supabase (Recommended)

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  did TEXT UNIQUE,
  public_key TEXT,
  trust_score REAL DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT, -- Encrypted
  owner_id UUID REFERENCES users(id),
  signatures JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log table
CREATE TABLE audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hash TEXT,
  previous_hash TEXT
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (auth.uid() = owner_id);
```

### PostgreSQL (Self-Hosted)

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE oxsig;
CREATE USER oxsig_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE oxsig TO oxsig_user;
\q

# Run migrations
psql -h localhost -U oxsig_user -d oxsig -f migrations/001_initial.sql
```

## Security Configuration

### HTTPS Setup

**Let's Encrypt (Free SSL):**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Security Headers

**Next.js Configuration (`next.config.ts`):**
```typescript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob:;
      font-src 'self';
      connect-src 'self' wss: ws:;
      worker-src 'self' blob:;
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      }
    ];
  }
};
```

### Rate Limiting

**Vercel (using Upstash Redis):**
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response("Rate limit exceeded", { status: 429 });
  }
}
```

## Monitoring & Analytics

### Error Tracking (Sentry)

```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});
```

### Performance Monitoring

**Web Vitals:**
```typescript
// pages/_app.tsx
export function reportWebVitals(metric: NextWebVitalsMetric) {
  // Send to analytics service
  gtag('event', metric.name, {
    value: Math.round(metric.value),
    event_label: metric.id,
  });
}
```

**Uptime Monitoring:**
```bash
# Health check endpoint
curl -f https://your-domain.com/api/health || exit 1
```

## Backup & Recovery

### Database Backups

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > "backup_${DATE}.sql"
gzip "backup_${DATE}.sql"

# Upload to S3
aws s3 cp "backup_${DATE}.sql.gz" s3://your-backup-bucket/
```

### Application Data

```bash
# Backup IndexedDB data (client-side)
const backup = await exportAllData();
const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
// Trigger download
```

## Performance Optimization

### CDN Configuration

**Cloudflare Settings:**
- Enable Brotli compression
- Minify HTML, CSS, JavaScript
- Browser cache TTL: 8 days
- Edge cache TTL: 7 days

**Cache Headers:**
```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};
```

### Image Optimization

```typescript
// next.config.ts
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    domains: ['your-domain.com'],
    minimumCacheTTL: 60,
  },
};
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oxsig
spec:
  replicas: 3
  selector:
    matchLabels:
      app: oxsig
  template:
    metadata:
      labels:
        app: oxsig
    spec:
      containers:
      - name: oxsig
        image: oxsig:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: oxsig-secrets
              key: database-url
```

### Database Scaling

**Read Replicas:**
```typescript
// Database connection with read/write splitting
const writeDb = new Pool({ connectionString: process.env.DATABASE_URL });
const readDb = new Pool({ connectionString: process.env.READ_REPLICA_URL });

// Use read replica for SELECT queries
const users = await readDb.query('SELECT * FROM users WHERE id = $1', [userId]);
```

## Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clear Next.js cache
rm -rf .next
pnpm build

# Check for TypeScript errors
pnpm tsc --noEmit

# Check for ESLint errors
pnpm lint
```

**Performance Issues:**
```bash
# Bundle analysis
pnpm install --save-dev @next/bundle-analyzer

# Lighthouse audit
npx lighthouse https://your-domain.com --output html
```

**Database Connection Issues:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Check connection limits
SELECT * FROM pg_stat_activity;
```

### Log Analysis

**Application Logs:**
```bash
# Vercel logs
vercel logs

# Railway logs
railway logs

# Docker logs
docker logs container_name
```

**Database Logs:**
```sql
-- PostgreSQL slow query log
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## Maintenance

### Regular Tasks

**Weekly:**
- Monitor error rates and performance
- Review security logs
- Update dependencies
- Backup verification

**Monthly:**
- Security audit
- Performance review
- Database maintenance
- Documentation updates

**Quarterly:**
- Dependency major updates
- Architecture review
- Disaster recovery testing
- Security penetration testing

### Update Process

```bash
# Update dependencies
pnpm update

# Test updates
pnpm test
pnpm build

# Deploy to staging
vercel --target staging

# Deploy to production
vercel --prod
```

---

This deployment guide provides comprehensive instructions for getting OxSig running in production with proper security, monitoring, and scaling considerations.