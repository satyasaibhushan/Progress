#!/bin/bash

# Monitoring Script for Progress App
# Shows status of all services and system resources

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

clear

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Progress App - System Monitor${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Docker Compose Status
echo -e "${YELLOW}📦 Container Status:${NC}"
docker compose -f docker-compose.prod.yml ps
echo ""

# System Resources
echo -e "${YELLOW}💻 System Resources:${NC}"
echo -e "${GREEN}CPU & Memory:${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo ""

# Disk Usage
echo -e "${GREEN}Disk Usage:${NC}"
df -h / | grep -v Filesystem
echo ""

# Docker Disk Usage
echo -e "${GREEN}Docker Disk Usage:${NC}"
docker system df
echo ""

# Database Status
echo -e "${YELLOW}🗄️  Database Status:${NC}"
if docker exec progress-db pg_isready -U progress >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is running${NC}"

    # Get database size
    DB_SIZE=$(docker exec progress-db psql -U progress -d progress_db -t -c "SELECT pg_size_pretty(pg_database_size('progress_db'));")
    echo -e "Database size: ${DB_SIZE}"

    # Get table count
    TABLE_COUNT=$(docker exec progress-db psql -U progress -d progress_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
    echo -e "Number of tables: ${TABLE_COUNT}"
else
    echo -e "${RED}❌ PostgreSQL is not responding${NC}"
fi
echo ""

# Recent Logs
echo -e "${YELLOW}📝 Recent Application Logs (last 10 lines):${NC}"
docker compose -f docker-compose.prod.yml logs --tail=10 app
echo ""

# Nginx Status (if running)
if command -v nginx >/dev/null 2>&1; then
    echo -e "${YELLOW}🌐 Nginx Status:${NC}"
    if systemctl is-active --quiet nginx; then
        echo -e "${GREEN}✅ Nginx is running${NC}"
        echo -e "Active connections: $(curl -s http://localhost/nginx_status 2>/dev/null | grep 'Active' || echo 'N/A')"
    else
        echo -e "${RED}❌ Nginx is not running${NC}"
    fi
    echo ""
fi

# SSL Certificate Status
if command -v certbot >/dev/null 2>&1; then
    echo -e "${YELLOW}🔒 SSL Certificate Status:${NC}"
    sudo certbot certificates 2>/dev/null | grep -A 2 "Certificate Name" || echo "No certificates found"
    echo ""
fi

# Backup Status
echo -e "${YELLOW}💾 Recent Backups:${NC}"
if [ -d "./backups" ]; then
    ls -lht ./backups/*.sql.gz 2>/dev/null | head -5 || echo "No backups found"
else
    echo "Backup directory not found"
fi
echo ""

# Uptime
echo -e "${YELLOW}⏱️  System Uptime:${NC}"
uptime
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Monitoring complete!${NC}"
echo -e "For live logs: ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
