# 📋 OxSig Backend - Quick Reference

## Essential Commands

### Start/Stop
```bash
make start          # Start all services
make stop           # Stop all services
make restart        # Restart services
make status         # Check health
```

### Logs
```bash
make logs           # All services
make logs-ws        # WebSocket gateway
make logs-db        # Database
docker compose logs -f <service>
```

### Database
```bash
make migrate        # Run migrations
make shell-db       # psql shell
make backup-db      # Create backup
```

### Development
```bash
make dev-ws         # Run WS gateway locally
make test           # Run tests
make fmt-ws         # Format Rust code
make lint-ws        # Lint Rust code
```

### Monitoring
```bash
make grafana        # Open Grafana
make prometheus     # Open Prometheus
make minio          # Open MinIO
```

## Service Endpoints

| Service | Port | URL |
|---------|------|-----|
| WebSocket | 8080 | ws://localhost:8080/ws |
| Postgres | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| NATS | 4222 | localhost:4222 |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| Meilisearch | 7700 | http://localhost:7700 |
| Grafana | 3001 | http://localhost:3001 |
| Prometheus | 9091 | http://localhost:9091 |

## Default Credentials

**Grafana**: admin / admin
**MinIO**: minioadmin / minioadmin123
**Postgres**: oxsig / changeme

⚠️ Change these in production!

## WebSocket Messages

### Join Room
```json
{
  "type": "join",
  "room": "room-id",
  "user_id": "user-123"
}
```

### WebRTC Offer
```json
{
  "type": "offer",
  "from": "user-1",
  "to": "user-2",
  "sdp": "v=0\r\no=..."
}
```

### Send Message
```json
{
  "type": "message",
  "from": "user-1",
  "room": "room-id",
  "data": {"text": "Hello"}
}
```

## Database Quick Queries

```sql
-- List users
SELECT id, public_key, created_at FROM users LIMIT 10;

-- Check documents
SELECT id, title, owner_id FROM documents WHERE is_deleted = false;

-- Audit trail
SELECT action, resource_type, created_at FROM audit_log ORDER BY created_at DESC LIMIT 20;

-- Active sessions
SELECT user_id, expires_at FROM sessions WHERE expires_at > NOW();
```

## Environment Variables

Required for production:
```bash
POSTGRES_PASSWORD=       # Strong password
JWT_SECRET=              # Random 32+ chars
MINIO_ROOT_PASSWORD=     # Strong password
MEILI_MASTER_KEY=        # Random key
ENCRYPTION_KEY=          # 32-byte hex
TURN_SECRET=             # Random secret
```

Generate secure values:
```bash
openssl rand -base64 32  # Passwords/secrets
openssl rand -hex 32     # Encryption key
```

## Troubleshooting

### Service won't start
```bash
docker compose logs <service>
docker compose ps
```

### Can't connect to DB
```bash
docker compose exec postgres pg_isready -U oxsig
```

### WebSocket issues
```bash
docker compose logs ws-gateway
wscat -c ws://localhost:8080/ws
```

### High memory
```bash
docker stats
```

### Reset everything
```bash
make clean
make setup
make start
```

## File Locations

- **Config**: `backend/`
- **Migrations**: `backend/migrations/`
- **Scripts**: `backend/scripts/`
- **Logs**: Via `docker compose logs`
- **Backups**: `/backups/` (in containers)

## Health Checks

```bash
# WebSocket Gateway
curl http://localhost:8080/health

# Postgres
docker compose exec postgres pg_isready

# Redis
docker compose exec redis valkey-cli ping

# NATS
curl http://localhost:8222/healthz

# MinIO
curl http://localhost:9000/minio/health/live
```

## Security

### Run scans
```bash
make security-scan
```

### Check vulnerabilities
```bash
docker run --rm -v $(pwd):/workspace aquasec/trivy fs /workspace
```

### Audit dependencies
```bash
pnpm audit
cd backend/ws-gateway && cargo audit
```

## Backup/Restore

### Create backup
```bash
make backup-db
make backup-files
```

### Restore
```bash
./backend/scripts/restore-postgres.sh <backup-file>
```

## CI/CD

Workflows in `.github/workflows/`:
- `ci-cd.yml` - Build, test, deploy
- `security-audit.yml` - Security scans

## Documentation

- **Backend**: `backend/README.md`
- **Deployment**: `backend/DEPLOYMENT.md`
- **Setup**: `BACKEND_SETUP_COMPLETE.md`
- **Architecture**: `docs/ARCHITECTURE.md`

## Support

- GitHub Issues
- See `CONTRIBUTING.md`
- Check `SECURITY.md` for security issues
