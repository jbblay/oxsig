#!/bin/bash

# OxSig Infrastructure Verification Script
# Tests all service connections

echo "🔍 Verifying OxSig Infrastructure..."
echo ""

ERRORS=0

# ============================================================================
# PostgreSQL
# ============================================================================
echo -n "Testing PostgreSQL... "
if docker exec oxsig-postgres pg_isready -U oxsig > /dev/null 2>&1; then
    echo "✅"
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================================
# MinIO
# ============================================================================
echo -n "Testing MinIO API... "
if curl -f -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "✅"
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

echo -n "Testing MinIO Console... "
if curl -f -s http://localhost:9001 > /dev/null 2>&1; then
    echo "✅"
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================================
# MeiliSearch
# ============================================================================
echo -n "Testing MeiliSearch... "
if curl -f -s http://localhost:7700/health > /dev/null 2>&1; then
    echo "✅"
    
    # Check if documents index exists
    echo -n "  - Checking documents index... "
    if curl -s http://localhost:7700/indexes/documents | grep -q '"uid":"documents"'; then
        echo "✅"
    else
        echo "⚠️  Not created"
    fi
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================================
# Redis
# ============================================================================
echo -n "Testing Redis... "
if docker exec oxsig-redis redis-cli ping | grep -q PONG; then
    echo "✅"
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================================
# pgAdmin
# ============================================================================
echo -n "Testing pgAdmin... "
if curl -f -s http://localhost:5050 > /dev/null 2>&1; then
    echo "✅"
else
    echo "❌ FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All services are healthy!"
    echo ""
    echo "Service URLs:"
    echo "  • App:            http://localhost:3000"
    echo "  • PostgreSQL:     localhost:5432"
    echo "  • MinIO Console:  http://localhost:9001"
    echo "  • MeiliSearch:    http://localhost:7700"
    echo "  • Redis:          localhost:6379"
    echo "  • pgAdmin:        http://localhost:5050"
    echo ""
    echo "Credentials:"
    echo "  • DB:    user=oxsig, password=oxsig_secure_password"
    echo "  • MinIO: user=minioadmin, password=minioadmin"
    echo "  • pgAdmin: user=admin@oxsig.local, password=admin"
else
    echo "❌ $ERRORS service(s) failed health check"
    echo ""
    echo "Check logs with: docker-compose logs [service-name]"
fi
echo "════════════════════════════════════════════"
