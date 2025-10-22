#!/bin/bash
# Backup script for Postgres database

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-oxsig}"
DB_USER="${DB_USER:-oxsig}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/oxsig_backup_$TIMESTAMP.sql.gz"

echo "Starting database backup..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "Backup file: $BACKUP_FILE"

# Create backup
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
    
    # Calculate backup size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $BACKUP_SIZE"
else
    echo "Backup failed!"
    exit 1
fi

# Delete old backups
echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "oxsig_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# List recent backups
echo "Recent backups:"
ls -lh "$BACKUP_DIR" | tail -5

echo "Backup process completed."
