#!/bin/bash

# 启动 PostgreSQL 和 Redis (使用 Docker)

echo "Starting PostgreSQL..."
docker run -d \
  --name miniclaw-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=miniclaw \
  -p 5432:5432 \
  postgres:15

echo "Starting Redis..."
docker run -d \
  --name miniclaw-redis \
  -p 6379:6379 \
  redis:7

echo ""
echo "Waiting for services to start..."
sleep 5

echo ""
echo "Services started successfully!"
echo "PostgreSQL: localhost:5432"
echo "Redis: localhost:6379"
echo ""
echo "To stop services, run:"
echo "  docker stop miniclaw-postgres miniclaw-redis"
echo "  docker rm miniclaw-postgres miniclaw-redis"
