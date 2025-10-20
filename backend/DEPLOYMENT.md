# OxSig Backend Deployment Guide

Complete guide for deploying the OxSig backend infrastructure.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Security Configuration](#security-configuration)
7. [Monitoring Setup](#monitoring-setup)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Docker** 24.0+ and **Docker Compose** 2.20+
- **Git** 2.40+
- **Make** (optional, for convenience)

### For Local Development
- **Rust** 1.75+ (for WebSocket gateway development)
- **Node.js** 20+ and **pnpm** 8+ (for frontend)

### For Production
- **Linux server** (Ubuntu 22.04 LTS recommended)
- **Domain name** with DNS configured
- **SSL certificates** (or use Caddy's automatic HTTPS)
- Minimum **4GB RAM** and **2 CPU cores**

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/oxsig.git
cd oxsig
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
POSTGRES_PASSWORD=<strong-random-password>

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<strong-random-password>

# Meilisearch
MEILI_MASTER_KEY=<strong-random-key>

# Application
JWT_SECRET=<strong-random-secret>
ENCRYPTION_KEY=<32-byte-hex-encoded-key>

# TURN Server
TURN_SECRET=<strong-random-secret>
```

### 3. Generate Secrets

Use strong random values:

```bash
# Generate secure passwords
openssl rand -base64 32

# Generate encryption key (32 bytes)
openssl rand -hex 32
```

## Local Development

### Quick Start

```bash
# Initialize backend
make setup

# Start all services
make start

# Check status
make status

# View logs
make logs
```

### Individual Services

```bash
# Start only core services
docker compose up -d postgres redis nats minio

# Start WebSocket Gateway locally
cd backend/ws-gateway
cargo run

# Start frontend
pnpm dev
```

### Development Workflow

1. **Make changes** to code
2. **Run tests**: `make test`
3. **Check formatting**: `make fmt-ws`
4. **Run linter**: `make lint-ws`
5. **Commit changes**

### Database Operations

```bash
# Run migrations
make migrate

# Access database shell
make shell-db

# Backup database
make backup-db
```

## Production Deployment

### Single Server Deployment

#### 1. Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Create deployment user
sudo useradd -m -s /bin/bash oxsig
sudo usermod -aG docker oxsig
```

#### 2. Deploy Application

```bash
# Switch to deployment user
sudo su - oxsig

# Clone repository
git clone https://github.com/yourusername/oxsig.git
cd oxsig

# Configure environment
cp .env.example .env
nano .env  # Edit with production values

# Start services
docker compose up -d
```

#### 3. Configure Domain & SSL

Edit `backend/caddy/Caddyfile`:

```caddyfile
oxsig.yourdomain.com {
    tls {
        protocols tls1.2 tls1.3
    }

    handle /ws* {
        reverse_proxy ws-gateway:8080
    }

    handle /api/* {
        reverse_proxy ws-gateway:8080
    }

    handle /* {
        reverse_proxy frontend:3000
    }
}
```

Restart Caddy:
```bash
docker compose restart caddy
```

#### 4. Configure Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp  # HTTP/3

# Allow TURN server
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp

sudo ufw enable
```

#### 5. Setup Automated Backups

```bash
# Create backup cron job
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/oxsig/oxsig/backend/scripts/backup-postgres.sh
30 2 * * * /home/oxsig/oxsig/backend/scripts/backup-minio.sh
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.27+
- kubectl configured
- Helm 3.12+

### 1. Create Namespace

```bash
kubectl create namespace oxsig
```

### 2. Create Secrets

```bash
kubectl create secret generic oxsig-secrets \
  --from-literal=postgres-password=$(openssl rand -base64 32) \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=minio-password=$(openssl rand -base64 32) \
  --from-literal=meili-key=$(openssl rand -base64 32) \
  -n oxsig
```

### 3. Deploy with Helm

```bash
# Add custom chart repository (when available)
helm repo add oxsig https://charts.oxsig.io
helm repo update

# Install
helm install oxsig oxsig/oxsig \
  --namespace oxsig \
  --values values-production.yaml
```

### 4. Configure Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: oxsig-ingress
  namespace: oxsig
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - oxsig.yourdomain.com
    secretName: oxsig-tls
  rules:
  - host: oxsig.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: oxsig-frontend
            port:
              number: 3000
```

Apply:
```bash
kubectl apply -f ingress.yaml
```

## Security Configuration

### 1. Enable Security Scanning

```bash
# Scan containers
make security-scan

# Set up automated scanning in CI/CD
# (Already configured in .github/workflows/security-audit.yml)
```

### 2. Configure Secrets Management

#### Using SOPS

```bash
# Install SOPS
brew install sops  # macOS
# or
sudo apt install sops  # Ubuntu

# Encrypt secrets
sops -e .env > .env.encrypted

# Decrypt for deployment
sops -d .env.encrypted > .env
```

#### Using HashiCorp Vault

```bash
# Store secrets in Vault
vault kv put secret/oxsig/postgres password=$(openssl rand -base64 32)
vault kv put secret/oxsig/jwt secret=$(openssl rand -base64 32)

# Retrieve in deployment
export POSTGRES_PASSWORD=$(vault kv get -field=password secret/oxsig/postgres)
```

### 3. Enable OPA Policies

```bash
# Start OPA server
docker run -d --name opa \
  -v $(pwd)/backend/security/opa-policies.rego:/policies/main.rego \
  openpolicyagent/opa:latest \
  run --server /policies

# Test policy
curl -X POST http://localhost:8181/v1/data/oxsig/document/access \
  -d @test-input.json
```

### 4. Configure Falco (Runtime Security)

```bash
# Install Falco
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco --namespace falco --create-namespace

# Configure rules
kubectl edit configmap falco -n falco
```

## Monitoring Setup

### 1. Access Monitoring Tools

- **Grafana**: http://your-domain:3001
- **Prometheus**: http://your-domain:9091
- **Uptime Kuma**: http://your-domain:3002

### 2. Configure Alerting

Edit `backend/observability/alertmanager.yml`:

```yaml
receivers:
  - name: 'email'
    email_configs:
      - to: 'ops@yourdomain.com'
        from: 'alerts@yourdomain.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alerts@yourdomain.com'
        auth_password: '<app-password>'

  - name: 'slack'
    slack_configs:
      - api_url: '<slack-webhook-url>'
        channel: '#alerts'
```

### 3. Import Grafana Dashboards

1. Open Grafana (http://localhost:3001)
2. Login (admin/admin)
3. Import dashboards:
   - **Node Exporter**: Dashboard ID 1860
   - **PostgreSQL**: Dashboard ID 9628
   - **Redis**: Dashboard ID 11835
   - **NATS**: Dashboard ID 12485

## Backup & Recovery

### Automated Backups

Backups run automatically via cron jobs:

- **Postgres**: Daily at 2:00 AM
- **MinIO**: Daily at 2:30 AM
- **Retention**: 30 days

### Manual Backup

```bash
# Backup database
make backup-db

# Backup files
make backup-files
```

### Restore from Backup

```bash
# List available backups
ls -lh /backups/postgres/

# Restore database
./backend/scripts/restore-postgres.sh /backups/postgres/oxsig_backup_TIMESTAMP.sql.gz

# Verify restoration
make shell-db
\dt  # List tables
SELECT COUNT(*) FROM users;
```

### Disaster Recovery Plan

1. **Regular Backups**: Automated daily backups to remote storage
2. **Off-site Storage**: Copy backups to S3/B2 storage
3. **Test Restores**: Monthly restoration tests
4. **Documentation**: Keep runbooks updated
5. **Monitoring**: Alert on backup failures

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose logs [service-name]

# Check resource usage
docker stats

# Restart service
docker compose restart [service-name]
```

### Database Connection Issues

```bash
# Test connection
docker compose exec postgres pg_isready -U oxsig

# Check connection count
docker compose exec postgres psql -U oxsig -d oxsig \
  -c "SELECT count(*) FROM pg_stat_activity;"

# Reset connections
docker compose restart postgres
```

### WebSocket Connection Failures

```bash
# Check gateway logs
docker compose logs ws-gateway

# Test WebSocket connection
wscat -c ws://localhost:8080/ws

# Check network
docker compose exec ws-gateway netstat -tlnp
```

### High Memory Usage

```bash
# Check memory usage
docker stats --no-stream

# Increase limits in docker-compose.yml
services:
  postgres:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Performance Issues

```bash
# Check slow queries
docker compose exec postgres psql -U oxsig -d oxsig \
  -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Analyze table
docker compose exec postgres psql -U oxsig -d oxsig \
  -c "ANALYZE VERBOSE;"

# Rebuild indexes
docker compose exec postgres psql -U oxsig -d oxsig \
  -c "REINDEX DATABASE oxsig;"
```

## Support

For issues and questions:
- **GitHub Issues**: https://github.com/yourusername/oxsig/issues
- **Documentation**: https://docs.oxsig.io
- **Discord**: https://discord.gg/oxsig

## License

See LICENSE file in the project root.
