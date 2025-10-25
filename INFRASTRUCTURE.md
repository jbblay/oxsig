# OxSig Infrastructure Setup

## Quick Start

Follow these steps to get the complete infrastructure running locally:

### 1. Start Infrastructure Services

```bash
# Start all services with Docker Compose
docker-compose up -d

# Check status
docker-compose ps
```

### 2. Initialize Services

```bash
# Run initialization script (MinIO buckets, MeiliSearch indexes)
bash scripts/init-services.sh
```

### 3. Verify Services

Visit these URLs to confirm everything is running:

- **PostgreSQL**: `localhost:5432` (use pgAdmin or any DB client)
- **MinIO Console**: http://localhost:9001 (user: `minioadmin`, pass: `minioadmin`)
- **MeiliSearch**: http://localhost:7700
- **Redis**: `localhost:6379`
- **pgAdmin**: http://localhost:5050 (user: `admin@oxsig.local`, pass: `admin`)

### 4. Start Next.js App

```bash
cd oxsig-frontend
pnpm run dev
```

Visit http://localhost:3000

---

## Services Overview

| Service | Port | Purpose | Credentials |
|---------|------|---------|-------------|
| PostgreSQL | 5432 | Database | user: `oxsig`, pass: `oxsig_secure_password` |
| MinIO API | 9000 | Object Storage | access: `minioadmin`, secret: `minioadmin` |
| MinIO Console | 9001 | Storage UI | user: `minioadmin`, pass: `minioadmin` |
| MeiliSearch | 7700 | Search Engine | No auth (dev mode) |
| Redis | 6379 | Cache/Sessions | No auth |
| pgAdmin | 5050 | DB Management | user: `admin@oxsig.local`, pass: `admin` |

---

## Management Commands

### Start All Services
```bash
docker-compose up -d
```

### Stop All Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f minio
docker-compose logs -f meilisearch
```

### Restart Services
```bash
docker-compose restart
```

### Clean Everything (⚠️ Deletes all data)
```bash
docker-compose down -v
```

---

## Database Migrations

Migrations are automatically run when PostgreSQL starts (from `oxsig-frontend/migrations/`).

To manually run migrations:

```bash
# Connect to PostgreSQL
docker exec -it oxsig-postgres psql -U oxsig -d oxsig

# Run migration file
docker exec -i oxsig-postgres psql -U oxsig -d oxsig < oxsig-frontend/migrations/001_initial_schema.sql
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using a port
netstat -an | findstr :5432
netstat -an | findstr :9000

# Kill process or change port in docker-compose.yml
```

### Services Not Starting

```bash
# Check Docker is running
docker ps

# View service logs
docker-compose logs [service-name]

# Recreate containers
docker-compose down
docker-compose up -d --force-recreate
```

### Can't Connect to PostgreSQL

```bash
# Verify container is running
docker ps | grep postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker exec -it oxsig-postgres psql -U oxsig -d oxsig -c "SELECT version();"
```

### MinIO Bucket Not Created

```bash
# Run init script again
bash scripts/init-services.sh

# Or create manually via MinIO Console
open http://localhost:9001
```

---

## Production Deployment

For production, use managed services:

- **Database**: AWS RDS, Supabase, Neon
- **Storage**: AWS S3, Cloudflare R2, Backblaze B2
- **Search**: MeiliCloud, Algolia
- **Cache**: Upstash Redis, Redis Cloud

Update `.env.local` with production URLs.

---

## Health Checks

All services have health checks configured. Check status:

```bash
docker-compose ps
```

Healthy services show `(healthy)` status.

---

## Data Persistence

Data is persisted in Docker volumes:

- `postgres_data` - Database
- `minio_data` - File storage
- `meilisearch_data` - Search indexes
- `redis_data` - Cache
- `pgadmin_data` - pgAdmin config

To backup:

```bash
docker run --rm -v oxsig_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .
```
