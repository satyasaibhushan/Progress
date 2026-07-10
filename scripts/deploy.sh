#!/usr/bin/env bash

# Production Deployment Script for Progress App
# This script handles deployment on AWS Lightsail

set -euo pipefail

echo "🚀 Starting deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Please copy .env.production.example to .env.production and fill in your values"
    exit 1
fi

# Load environment variables without splitting quoted values or executing `xargs`.
set -a
. ./.env.production
set +a

echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down

echo -e "${YELLOW}🏗️  Building new images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${YELLOW}📊 Running database migrations...${NC}"
# Migrations run automatically via the Compose application command.

echo -e "${YELLOW}🚀 Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check if containers are running
if docker compose -f docker-compose.prod.yml ps --status running --services | grep -q '^app$'; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}Application is running at: ${NEXTAUTH_URL}${NC}"
else
    echo -e "${RED}❌ Deployment failed! Check logs with: docker compose -f docker-compose.prod.yml logs${NC}"
    exit 1
fi

# Show container status
echo -e "\n${YELLOW}📊 Container Status:${NC}"
docker compose -f docker-compose.prod.yml ps

# Clean up old images
echo -e "\n${YELLOW}🧹 Cleaning up old Docker images...${NC}"
docker image prune -f

echo -e "\n${GREEN}✨ Deployment complete!${NC}"
echo -e "View logs: ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
