.PHONY: help setup start stop restart logs clean build test security-scan backup

# Default target
help:
	@echo "OxSig Backend - Available Commands"
	@echo "=================================="
	@echo "make setup          - Initialize backend environment"
	@echo "make start          - Start all services"
	@echo "make stop           - Stop all services"
	@echo "make restart        - Restart all services"
	@echo "make logs           - Show logs (all services)"
	@echo "make logs-ws        - Show WebSocket gateway logs"
	@echo "make logs-db        - Show Postgres logs"
	@echo "make build          - Build all Docker images"
	@echo "make clean          - Stop and remove all containers"
	@echo "make test           - Run tests"
	@echo "make security-scan  - Run security scanning"
	@echo "make backup-db      - Backup Postgres database"
	@echo "make backup-files   - Backup MinIO files"
	@echo "make migrate        - Run database migrations"
	@echo "make shell-db       - Open Postgres shell"
	@echo "make shell-redis    - Open Redis CLI"
	@echo "make status         - Show service status"

# Setup and initialization
setup:
	@echo "Setting up backend environment..."
	@if [ ! -f .env ]; then \
		echo "Creating .env from .env.example..."; \
		cp .env.example .env; \
		echo "Please edit .env with your configuration"; \
	fi
	@chmod +x backend/scripts/*.sh
	@mkdir -p backend/observability/grafana/{dashboards,datasources}
	@echo "Setup complete!"

# Start services
start:
	@echo "Starting backend services..."
	docker compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@make status

# Stop services
stop:
	@echo "Stopping backend services..."
	docker compose stop

# Restart services
restart: stop start

# View logs
logs:
	docker compose logs -f

logs-ws:
	docker compose logs -f ws-gateway

logs-db:
	docker compose logs -f postgres

# Build images
build:
	@echo "Building Docker images..."
	docker compose build

# Clean up
clean:
	@echo "Stopping and removing all containers..."
	docker compose down -v
	@echo "Cleanup complete!"

# Run tests
test:
	@echo "Running Rust tests..."
	cd backend/ws-gateway && cargo test
	@echo "Tests complete!"

# Security scanning
security-scan:
	@echo "Running security scans..."
	@docker run --rm -v $(PWD):/workspace aquasec/trivy fs /workspace
	@echo "Scanning WebSocket Gateway image..."
	@docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
		aquasec/trivy image oxsig-backend-ws-gateway:latest

# Database operations
migrate:
	@echo "Running database migrations..."
	docker compose exec -T postgres psql -U oxsig -d oxsig < backend/migrations/001_initial_schema.sql
	@echo "Migrations complete!"

shell-db:
	docker compose exec postgres psql -U oxsig -d oxsig

shell-redis:
	docker compose exec redis valkey-cli

# Backup operations
backup-db:
	@echo "Backing up Postgres database..."
	@docker compose exec postgres bash /app/scripts/backup-postgres.sh

backup-files:
	@echo "Backing up MinIO files..."
	@bash backend/scripts/backup-minio.sh

# Status check
status:
	@echo "Service Status:"
	@docker compose ps
	@echo ""
	@echo "Health Checks:"
	@docker compose ps | grep -E "healthy|unhealthy" || echo "No health status available"

# Development helpers
dev-ws:
	@echo "Starting WebSocket Gateway in development mode..."
	cd backend/ws-gateway && cargo run

watch-ws:
	@echo "Starting WebSocket Gateway with hot reload..."
	cd backend/ws-gateway && cargo watch -x run

fmt-ws:
	@echo "Formatting Rust code..."
	cd backend/ws-gateway && cargo fmt

lint-ws:
	@echo "Linting Rust code..."
	cd backend/ws-gateway && cargo clippy -- -D warnings

# Monitoring
grafana:
	@echo "Opening Grafana..."
	@open http://localhost:3001 || xdg-open http://localhost:3001 || start http://localhost:3001

prometheus:
	@echo "Opening Prometheus..."
	@open http://localhost:9091 || xdg-open http://localhost:9091 || start http://localhost:9091

minio:
	@echo "Opening MinIO Console..."
	@open http://localhost:9001 || xdg-open http://localhost:9001 || start http://localhost:9001
