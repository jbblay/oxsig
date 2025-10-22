#!/bin/bash
# Initialize backend services

set -e

echo "Initializing OxSig Backend Services..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env file with your configuration."
fi

# Create necessary directories
echo "Creating directories..."
mkdir -p backend/{migrations,observability,caddy,coturn,scripts,security}
mkdir -p backend/observability/grafana/{dashboards,datasources}

# Set permissions for scripts
echo "Setting script permissions..."
chmod +x backend/scripts/*.sh

# Pull Docker images
echo "Pulling Docker images..."
docker compose pull

# Create database if it doesn't exist
echo "Initializing database..."
docker compose up -d postgres
sleep 5

# Run migrations
echo "Running database migrations..."
docker compose exec -T postgres psql -U oxsig -d oxsig < backend/migrations/001_initial_schema.sql || true

# Initialize MinIO buckets
echo "Initializing MinIO buckets..."
docker compose up -d minio
sleep 5

# Create default buckets
docker compose exec -T minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker compose exec -T minio mc mb local/oxsig-documents || true
docker compose exec -T minio mc mb local/oxsig-backups || true

# Start all services
echo "Starting all services..."
docker compose up -d

echo ""
echo "Backend services initialized successfully!"
echo ""
echo "Services:"
echo "  - Postgres: localhost:5432"
echo "  - Redis: localhost:6379"
echo "  - NATS: localhost:4222"
echo "  - MinIO API: localhost:9000"
echo "  - MinIO Console: localhost:9001"
echo "  - Meilisearch: localhost:7700"
echo "  - WebSocket Gateway: localhost:8080"
echo "  - Grafana: localhost:3001 (admin/admin)"
echo "  - Prometheus: localhost:9091"
echo ""
echo "Check service status with: docker compose ps"
echo "View logs with: docker compose logs -f [service-name]"
