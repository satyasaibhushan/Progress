#!/bin/bash

# Database Backup Script for Progress App

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load environment variables
if [ -f .env.production ]; then
    set -a
    . ./.env.production
    set +a
else
    echo -e "${RED}Error: .env.production file not found!${NC}"
    exit 1
fi

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/progress_backup_${TIMESTAMP}.sql"
CONTAINER_NAME="progress-db"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

echo -e "${YELLOW}📦 Creating database backup...${NC}"

# Create backup
docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER:-progress}" "${DB_NAME:-progress_db}" > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    # Compress the backup
    gzip "${BACKUP_FILE}"
    BACKUP_FILE="${BACKUP_FILE}.gz"

    # Get file size
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)

    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo -e "File: ${BACKUP_FILE}"
    echo -e "Size: ${SIZE}"

    # Keep only last 7 backups
    echo -e "\n${YELLOW}🧹 Cleaning old backups (keeping last 7)...${NC}"
    ls -t ${BACKUP_DIR}/progress_backup_*.sql.gz | tail -n +8 | xargs -r rm

    # List all backups
    echo -e "\n${GREEN}Available backups:${NC}"
    ls -lh ${BACKUP_DIR}/progress_backup_*.sql.gz
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi
