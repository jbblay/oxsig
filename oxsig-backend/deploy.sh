#!/bin/bash
# Railway Deployment Script for OxSig Backend
# Usage: ./deploy.sh

set -e

echo "🚀 OxSig Backend - Railway Deployment"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo ""
    echo "Install it with:"
    echo "  npm install -g @railway/cli"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Railway CLI found"

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Not logged in to Railway"
    echo ""
    echo "Logging in..."
    railway login
fi

echo -e "${GREEN}✓${NC} Logged in to Railway"

# Check if in correct directory
if [ ! -f "Cargo.toml" ]; then
    echo -e "${RED}❌ Not in oxsig-backend directory${NC}"
    echo "Run this script from: oxsig-backend/"
    exit 1
fi

echo -e "${GREEN}✓${NC} In correct directory"

# Check for required files
FILES=("Cargo.toml" "railway.toml" "Dockerfile.production" "src/main.rs")
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ] && [ ! -d "$file" ]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓${NC} All required files present"

# Check if Railway project exists
if ! railway status &> /dev/null; then
    echo ""
    echo -e "${YELLOW}No Railway project linked${NC}"
    echo "Creating new Railway project..."
    railway init
fi

echo -e "${GREEN}✓${NC} Railway project linked"

# Check environment variables
echo ""
echo "📋 Checking environment variables..."

JWT_SECRET=$(railway variables get JWT_SECRET 2>/dev/null || echo "")
if [ -z "$JWT_SECRET" ]; then
    echo -e "${YELLOW}⚠${NC}  JWT_SECRET not set"
    echo ""
    read -p "Generate random JWT_SECRET? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        NEW_SECRET=$(openssl rand -base64 32)
        railway variables set JWT_SECRET="$NEW_SECRET"
        echo -e "${GREEN}✓${NC} JWT_SECRET set"
    else
        echo "Skipping JWT_SECRET setup"
    fi
else
    echo -e "${GREEN}✓${NC} JWT_SECRET configured"
fi

# Optional: Set other variables
WS_AUTH=$(railway variables get WS_REQUIRE_AUTH 2>/dev/null || echo "")
if [ -z "$WS_AUTH" ]; then
    echo -e "${YELLOW}⚠${NC}  WS_REQUIRE_AUTH not set"
    railway variables set WS_REQUIRE_AUTH=false
    echo -e "${GREEN}✓${NC} WS_REQUIRE_AUTH set to false"
fi

RUST_LOG=$(railway variables get RUST_LOG 2>/dev/null || echo "")
if [ -z "$RUST_LOG" ]; then
    railway variables set RUST_LOG=info
    echo -e "${GREEN}✓${NC} RUST_LOG set to info"
fi

# Deploy
echo ""
echo "🚀 Deploying to Railway..."
echo ""
railway up

# Get deployment URL
echo ""
echo "⏳ Waiting for deployment..."
sleep 5

URL=$(railway domain 2>/dev/null || echo "")
if [ -z "$URL" ]; then
    echo ""
    echo -e "${YELLOW}⚠${NC}  No domain configured yet"
    echo "Generate one with: railway domain"
else
    echo ""
    echo -e "${GREEN}✓${NC} Deployment complete!"
    echo ""
    echo "📡 Your backend is live at:"
    echo "   https://$URL"
    echo ""
    echo "🧪 Test it with:"
    echo "   curl https://$URL/health"
    echo ""
    echo "🔌 WebSocket URL:"
    echo "   wss://$URL/ws"
    echo ""
    
    # Test health endpoint
    echo "Testing health endpoint..."
    if curl -f -s "https://$URL/health" > /dev/null; then
        echo -e "${GREEN}✓${NC} Health check passed!"
        echo ""
        curl -s "https://$URL/health" | json_pp 2>/dev/null || curl -s "https://$URL/health"
    else
        echo -e "${YELLOW}⚠${NC}  Health check not ready yet (this is normal)"
        echo "   Check status with: railway logs"
    fi
fi

echo ""
echo "📊 View logs with: railway logs --follow"
echo "📈 View metrics at: https://$URL/metrics"
echo ""
echo -e "${GREEN}Deployment complete!${NC} 🎉"
