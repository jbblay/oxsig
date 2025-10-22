#!/bin/bash
# MinIO backup script

set -e

# Configuration
MINIO_HOST="${MINIO_HOST:-minio:9000}"
MINIO_BUCKET="${MINIO_BUCKET:-oxsig-documents}"
BACKUP_DIR="${BACKUP_DIR:-/backups/minio}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/minio_backup_$TIMESTAMP.tar.gz"

echo "Starting MinIO backup..."
echo "Bucket: $MINIO_BUCKET"
echo "Backup file: $BACKUP_FILE"

# Configure mc (MinIO Client)
mc alias set minio "http://$MINIO_HOST" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# Mirror bucket to local directory
TEMP_DIR=$(mktemp -d)
mc mirror "minio/$MINIO_BUCKET" "$TEMP_DIR"

# Create compressed archive
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $BACKUP_SIZE"
else
    echo "Backup failed!"
    exit 1
fi

# Delete old backups
echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "minio_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup process completed."
