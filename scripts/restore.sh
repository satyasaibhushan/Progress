#!/bin/bash

# Database Restore Script for Progress App

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env.production file not found!${NC}"
    exit 1
fi

CONTAINER_NAME="progress-db"
BACKUP_DIR="./backups"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Available backups:${NC}"
    ls -lh ${BACKUP_DIR}/progress_backup_*.sql.gz
    echo -e "\n${RED}Usage: $0 <backup_file>${NC}"
    echo -e "Example: $0 ${BACKUP_DIR}/progress_backup_20240115_120000.sql.gz"
    exit 1
fi

BACKUP_FILE=$1

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo -e "${RED}Error: Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

# Warning
echo -e "${RED}⚠️  WARNING: This will REPLACE all existing data!${NC}"
echo -e "Backup file: ${BACKUP_FILE}"
read -p "Are you sure you want to continue? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
fi

echo -e "${YELLOW}📦 Restoring database from backup...${NC}"

# Decompress if gzipped
if [[ ${BACKUP_FILE} == *.gz ]]; then
    gunzip -c ${BACKUP_FILE} | docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER:-progress} -d ${DB_NAME:-progress_db}
else
    docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER:-progress} -d ${DB_NAME:-progress_db} < ${BACKUP_FILE}
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database restored successfully!${NC}"
else
    echo -e "${RED}❌ Restore failed!${NC}"
    exit 1
fi

# Restart the app
echo -e "${YELLOW}🔄 Restarting application...${NC}"
docker-compose -f docker-compose.prod.yml restart app

echo -e "${GREEN}✨ Restore complete!${NC}"
