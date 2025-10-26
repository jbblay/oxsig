#!/bin/bash

# OxSig Infrastructure Initialization Script
# Sets up MinIO buckets and MeiliSearch indexes

echo "🚀 Initializing OxSig Infrastructure..."

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# ============================================================================
# MinIO Setup
# ============================================================================
echo "📦 Setting up MinIO..."

# Install MinIO client if not present
if ! command -v mc &> /dev/null; then
    echo "📥 Installing MinIO client..."
    wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /tmp/mc
    chmod +x /tmp/mc
    MC_CMD="/tmp/mc"
else
    MC_CMD="mc"
fi

# Configure MinIO
$MC_CMD alias set oxsig-local http://localhost:9000 minioadmin minioadmin

# Create buckets
echo "🪣 Creating MinIO buckets..."
$MC_CMD mb oxsig-local/oxsig --ignore-existing
$MC_CMD mb oxsig-local/oxsig-backups --ignore-existing

# Set bucket policies (public read for testing - change in production!)
$MC_CMD anonymous set download oxsig-local/oxsig

echo "✅ MinIO setup complete"

# ============================================================================
# MeiliSearch Setup
# ============================================================================
echo "🔍 Setting up MeiliSearch..."

# Create documents index
curl -X POST 'http://localhost:7700/indexes' \
  -H 'Content-Type: application/json' \
  --data-binary '{
    "uid": "documents",
    "primaryKey": "id"
  }'

# Configure searchable attributes
curl -X PUT 'http://localhost:7700/indexes/documents/settings/searchable-attributes' \
  -H 'Content-Type: application/json' \
  --data-binary '["title", "content", "tags"]'

# Configure filterable attributes
curl -X PUT 'http://localhost:7700/indexes/documents/settings/filterable-attributes' \
  -H 'Content-Type: application/json' \
  --data-binary '["ownerId", "status", "tags", "encrypted"]'

# Configure sortable attributes
curl -X PUT 'http://localhost:7700/indexes/documents/settings/sortable-attributes' \
  -H 'Content-Type: application/json' \
  --data-binary '["createdAt", "updatedAt"]'

echo "✅ MeiliSearch setup complete"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         OxSig Infrastructure Setup Complete! ✅             ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  PostgreSQL:    localhost:5432                             ║"
echo "║  MinIO API:     http://localhost:9000                      ║"
echo "║  MinIO Console: http://localhost:9001                      ║"
echo "║  MeiliSearch:   http://localhost:7700                      ║"
echo "║  Redis:         localhost:6379                             ║"
echo "║  pgAdmin:       http://localhost:5050                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. cd oxsig"
echo "  2. pnpm run dev"
echo ""
