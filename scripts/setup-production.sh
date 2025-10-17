#!/bin/bash

# OxSig Production Setup Script
# Adds essential features for real-world deployment

echo "🚀 Setting up OxSig for production..."
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Installing..."
    npm install -g pnpm
fi

echo "📦 Installing production dependencies..."

# Essential production packages
pnpm add @supabase/supabase-js  # Cloud sync & storage
pnpm add next-auth @auth/prisma-adapter  # Authentication
pnpm add prisma @prisma/client  # Database ORM
pnpm add @upstash/ratelimit @upstash/redis  # Rate limiting
pnpm add jose  # JWT tokens
pnpm add zod  # Schema validation

# Development dependencies
pnpm add -D @types/node

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "📝 Next steps:"
echo "1. Create .env.local with your credentials"
echo "2. Run: npx prisma init"
echo "3. Configure your database schema"
echo "4. Run: npx prisma migrate dev"
echo "5. Deploy: vercel --prod"
echo ""
echo "📖 See PRODUCTION_DEPLOYMENT.md for detailed instructions"
