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
echo "   cd oxsig-frontend && pnpm dev"
echo ""
echo "   Wait for: ✓ Ready on http://localhost:3000"
echo ""

# Step 3: Test instructions
echo "🧪 Step 3: Open browser and test:"
echo ""
echo "   1. Navigate to: http://localhost:3000/auth-test"
echo "   2. Register a new user"
echo "   3. Login with same credentials"
echo "   4. Check that you can access protected routes"
echo ""
echo "🎯 Expected Results:"
echo "   ✓ User registration succeeds"
echo "   ✓ Login succeeds and sets cookie"
echo "   ✓ Can access /profile, /vault"
echo "   ✓ See offline indicator in UI"
echo ""

# Step 4: Run integration tests (optional)
echo "🔬 Step 4 (Optional): Run integration tests:"
echo ""
echo "   In a NEW terminal (while dev server is running):"
echo "   cd oxsig-frontend && pnpm test:run"
echo ""
echo "   All 56 tests (44 unit + 12 integration) should PASS"
echo ""
echo "======================================"
echo "📖 Full testing guide: TESTING_GUIDE.md"
echo "======================================"
