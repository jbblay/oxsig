# PowerShell Production Setup Script
# OxSig - Making it production-ready

Write-Host "🚀 Setting up OxSig for production..." -ForegroundColor Cyan
Write-Host ""

# Check if pnpm is installed
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm not found. Installing..." -ForegroundColor Yellow
    npm install -g pnpm
}

Write-Host "📦 Installing production dependencies..." -ForegroundColor Green

# Essential production packages
pnpm add @supabase/supabase-js  # Cloud sync & storage
pnpm add next-auth @auth/prisma-adapter  # Authentication
pnpm add prisma @prisma/client  # Database ORM
pnpm add @upstash/ratelimit @upstash/redis  # Rate limiting
pnpm add jose  # JWT tokens
pnpm add zod  # Schema validation

# Development dependencies
pnpm add -D @types/node

Write-Host ""
Write-Host "✅ Dependencies installed!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Create .env.local with your credentials"
Write-Host "2. Run: npx prisma init"
Write-Host "3. Configure your database schema"
Write-Host "4. Run: npx prisma migrate dev"
Write-Host "5. Deploy: vercel --prod"
Write-Host ""
Write-Host "📖 See PRODUCTION_DEPLOYMENT.md for detailed instructions" -ForegroundColor Yellow
