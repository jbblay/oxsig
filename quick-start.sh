#!/bin/bash
# Quick Start Script for OxSig Testing

echo "🚀 OxSig Local Testing - Quick Start"
echo "======================================"
echo ""

# Step 1: Check Docker services
echo "📦 Step 1: Checking Docker services..."
docker-compose ps

echo ""
echo "✅ If all services show 'Up', proceed to next step"
echo ""

# Step 2: Start dev server
echo "🔧 Step 2: Starting Next.js dev server..."
echo "   Run this command in a terminal:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Start Frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   cd oxsig && pnpm dev"
echo ""
echo "   Wait for: ✓ Ready on http://localhost:3000"
echo ""

echo "🧪 Step 3: Test the application:"
echo ""
echo "   1. Navigate to: http://localhost:3000"
echo "   2. Explore the features"
echo ""
echo "======================================"
echo "✨ OxSig is ready!"
echo "======================================"

