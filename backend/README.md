# OxSig Backend

Complete backend infrastructure for the OxSig platform.

## Architecture

The backend consists of multiple services orchestrated with Docker Compose:

### Core Services
- **Postgres** - Primary database
- **Redis/Valkey** - Cache and message queue
- **NATS JetStream** - Event bus for real-time messaging
- **MinIO** - S3-compatible object storage
- **Meilisearch** - Full-text search engine

### Networking & Real-time
- **WebSocket Gateway (Rust/Axum)** - WebSocket server for real-time communication and WebRTC signaling
- **Coturn** - TURN server for WebRTC NAT traversal
- **Caddy** - Reverse proxy with automatic HTTPS

### Observability
- **Prometheus** - Metrics collection
- **Grafana** - Visualization and dashboards
- **Loki** - Log aggregation
- **Promtail** - Log shipper
- **Tempo** - Distributed tracing
- **OpenTelemetry Collector** - Telemetry data processing
- **Alertmanager** - Alert routing and management

### Monitoring Exporters
- **Node Exporter** - System metrics
- **Postgres Exporter** - Database metrics
- **Redis Exporter** - Cache metrics

### Additional Tools
- **Uptime Kuma** - Status page and uptime monitoring

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git
- (Optional) Rust toolchain for local development

### Setup

1. **Clone the repository** (if not already done)
```bash
cd oxsig
```

2. **Initialize backend services**
```bash
chmod +x backend/scripts/init-backend.sh
./backend/scripts/init-backend.sh
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start services**
```bash
docker compose up -d
```

5. **Check service status**
```bash
docker compose ps
```

## Service Endpoints

| Service | Port | URL |
|---------|------|-----|
| Postgres | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| NATS | 4222 | localhost:4222 |
| NATS Monitoring | 8222 | http://localhost:8222 |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| Meilisearch | 7700 | http://localhost:7700 |
| WebSocket Gateway | 8080 | ws://localhost:8080/ws |
| Grafana | 3001 | http://localhost:3001 |
| Prometheus | 9091 | http://localhost:9091 |
| Uptime Kuma | 3002 | http://localhost:3002 |

## Database

### Schema

The database includes tables for:
- Users and authentication
- Documents and signatures
- Consent records
- Audit logs
- Collaboration rooms
- Device pairing
- Encrypted vault items
- P2P connections
- Notifications

### Migrations

Database migrations are in `backend/migrations/`. They're automatically applied on first startup.

To run migrations manually:
```bash
docker compose exec postgres psql -U oxsig -d oxsig < backend/migrations/001_initial_schema.sql
```

## WebSocket Gateway

The Rust-based WebSocket gateway handles:
- WebRTC signaling (offer/answer/ICE candidates)
- Real-time messaging
- Room management
- P2P connection coordination

### Local Development
```bash
cd backend/ws-gateway
cargo run
```

### Building
```bash
cd backend/ws-gateway
cargo build --release
```

## Backups

### Automated Backups

The backup scripts support automated backups of Postgres and MinIO.

#### Postgres Backup
```bash
docker compose exec postgres /app/scripts/backup-postgres.sh
```

#### MinIO Backup
```bash
./backend/scripts/backup-minio.sh
```

### Restore

#### Restore Postgres
```bash
./backend/scripts/restore-postgres.sh /backups/postgres/oxsig_backup_TIMESTAMP.sql.gz
```

## Observability

### Grafana Dashboards

Access Grafana at http://localhost:3001 (admin/admin)

Pre-configured datasources:
- Prometheus (metrics)
- Loki (logs)
- Tempo (traces)

### Prometheus Metrics

View metrics at http://localhost:9091

Scraped services:
- WebSocket Gateway
- Postgres
- Redis
- NATS
- Node metrics

### Logs

Logs are collected by Promtail and sent to Loki. View in Grafana's Explore section.

### Traces

Distributed traces are collected via OpenTelemetry and stored in Tempo.

## Security

### Scanning

Run security scans:
```bash
# Container scanning
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image oxsig-ws-gateway:latest

# Filesystem scanning
docker run --rm -v $(pwd):/workspace \
  aquasec/trivy fs /workspace
```

### Policy Enforcement

OPA policies are defined in `backend/security/opa-policies.rego`

### Secrets Management

- Use `.env` file for local development
- Use HashiCorp Vault or SOPS for production
- Never commit secrets to version control

## CI/CD

GitHub Actions workflows:
- `ci-cd.yml` - Build, test, and deploy
- `security-audit.yml` - Security scanning and dependency audits

## Networking

### Reverse Proxy

Caddy handles:
- TLS termination
- WebSocket upgrades
- Load balancing
- Rate limiting

Configuration: `backend/caddy/Caddyfile`

### TURN Server

Coturn configuration: `backend/coturn/turnserver.conf`

Update `external-ip` with your server's public IP.

## Development

### Running Locally

1. Start infrastructure:
```bash
docker compose up -d postgres redis nats minio meilisearch
```

2. Run WebSocket Gateway:
```bash
cd backend/ws-gateway
cargo run
```

3. Run Next.js frontend:
```bash
pnpm dev
```

### Logs

View logs for specific service:
```bash
docker compose logs -f [service-name]
```

View all logs:
```bash
docker compose logs -f
```

## Production Deployment

### Kubernetes

For production Kubernetes deployment:
1. Convert docker-compose to k8s manifests
2. Use Helm charts
3. Configure ingress with cert-manager
4. Set up persistent volumes
5. Configure secrets management

### Environment Variables

Required for production:
- `POSTGRES_PASSWORD` - Strong database password
- `JWT_SECRET` - Secret for JWT token signing
- `MINIO_ROOT_PASSWORD` - MinIO admin password
- `MEILI_MASTER_KEY` - Meilisearch master key
- `TURN_SECRET` - TURN server secret

## Monitoring & Alerts

### Health Checks

All services have health checks configured. Check with:
```bash
docker compose ps
```

### Alerts

Configure alerting in `backend/observability/alertmanager.yml`

Supported channels:
- Email
- Slack
- PagerDuty
- Webhook

## Troubleshooting

### Service won't start

Check logs:
```bash
docker compose logs [service-name]
```

### Database connection issues

Verify Postgres is running:
```bash
docker compose exec postgres pg_isready -U oxsig
```

### WebSocket connection fails

Check gateway logs:
```bash
docker compose logs ws-gateway
```

Verify network connectivity and CORS settings.

## Contributing

See main project CONTRIBUTING.md for guidelines.

## License

See main project LICENSE file.
