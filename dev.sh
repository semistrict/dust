#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Dust local development script
#
# Runs infrastructure in Docker, application code locally for fast iteration.
#
# Usage:
#   ./dev.sh infra     # Start infrastructure services only
#   ./dev.sh front     # Run front (Next.js) locally
#   ./dev.sh core      # Run core (Rust) API locally
#   ./dev.sh oauth     # Run OAuth service locally
#   ./dev.sh connectors # Run connectors locally
#   ./dev.sh initdb    # Initialize front database tables
#   ./dev.sh stop      # Stop infrastructure services
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env file if it exists (for ELASTICSEARCH_PASSWORD, API keys, etc.)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Infrastructure service hostnames (localhost when running outside Docker)
DB_HOST=localhost
REDIS_HOST=localhost
ES_HOST=localhost
QDRANT_HOST=localhost
TEMPORAL_HOST=localhost
TIKA_HOST=localhost
WORKOS_HOST=localhost

case "${1:-help}" in

  infra)
    echo "Starting infrastructure services..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d \
      db db-init redis qdrant elasticsearch temporal fake-workos apache-tika
    echo ""
    echo "Waiting for services to be healthy..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" \
      exec db pg_isready -U dev -q 2>/dev/null && echo "  postgres: ready" || echo "  postgres: starting..."
    echo ""
    echo "Infrastructure is up. Now run in separate terminals:"
    echo "  ./dev.sh initdb      # (first time only) create database tables"
    echo "  ./dev.sh core        # start core API on :3001"
    echo "  ./dev.sh oauth       # start oauth on :3006"
    echo "  ./dev.sh front       # start front on :3000"
    ;;

  initdb)
    echo "Initializing front database tables..."
    cd "$SCRIPT_DIR/front"
    NODE_ENV=development \
    FRONT_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_front" \
    FRONT_DATABASE_READ_REPLICA_URI="postgres://dev:dev@${DB_HOST}:5432/dust_front" \
    REDIS_URI="redis://${REDIS_HOST}:6379" \
    REDIS_CACHE_URI="redis://${REDIS_HOST}:6379" \
    CORE_API="http://localhost:3001" \
    CONNECTORS_API="http://localhost:3002" \
    OAUTH_API="http://localhost:3006" \
    ELASTICSEARCH_URL="http://${ES_HOST}:9200" \
    ELASTICSEARCH_USERNAME=elastic \
    ELASTICSEARCH_PASSWORD="${ELASTICSEARCH_PASSWORD:-dust-dev-password}" \
    ALLOW_UNSAFE_INITDB=true \
      npx tsx admin/db.ts
    echo "Database initialized."
    ;;

  core)
    echo "Starting core API on :3001..."
    cd "$SCRIPT_DIR/core"
    exec env \
      CORE_PORT=3001 \
      CORE_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_api" \
      CORE_DATABASE_READ_REPLICA_URI="postgres://dev:dev@${DB_HOST}:5432/dust_api" \
      OAUTH_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_oauth" \
      REDIS_URI="redis://${REDIS_HOST}:6379" \
      REDIS_CACHE_URI="redis://${REDIS_HOST}:6379" \
      ELASTICSEARCH_URL="http://${ES_HOST}:9200" \
      ELASTICSEARCH_USERNAME=elastic \
      ELASTICSEARCH_PASSWORD="${ELASTICSEARCH_PASSWORD:-dust-dev-password}" \
      QDRANT_CLUSTER_0_URL="http://${QDRANT_HOST}:6334" \
      QDRANT_CLUSTER_0_API_KEY=dummy \
      QDRANT_USE_SHARDING=false \
      DISABLE_API_KEY_CHECK=true \
      IS_LOCAL_DEV=true \
      cargo run --bin core-api
    ;;

  oauth)
    echo "Starting OAuth service on :3006..."
    cd "$SCRIPT_DIR/core"
    exec env \
      OAUTH_PORT=3006 \
      OAUTH_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_oauth" \
      cargo run --bin oauth
    ;;

  front)
    echo "Starting front (Next.js) on :3000..."
    cd "$SCRIPT_DIR/front"
    exec env \
      NODE_ENV=development \
      IS_DEVELOPMENT=true \
      DUST_DISABLE_PAYWALL=true \
      DUST_DISABLE_USAGE_LIMITS=true \
      PORT=3000 \
      FRONT_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_front" \
      FRONT_DATABASE_READ_REPLICA_URI="postgres://dev:dev@${DB_HOST}:5432/dust_front" \
      REDIS_URI="redis://${REDIS_HOST}:6379" \
      REDIS_CACHE_URI="redis://${REDIS_HOST}:6379" \
      ELASTICSEARCH_URL="http://${ES_HOST}:9200" \
      ELASTICSEARCH_USERNAME=elastic \
      ELASTICSEARCH_PASSWORD="${ELASTICSEARCH_PASSWORD:-dust-dev-password}" \
      TEXT_EXTRACTION_URL="http://${TIKA_HOST}:9998" \
      TEMPORAL_ADDRESS="${TEMPORAL_HOST}:7233" \
      CORE_API="http://localhost:3001" \
      CONNECTORS_API="http://localhost:3002" \
      OAUTH_API="http://localhost:3006" \
      DUST_FRONT_API="http://localhost:3000" \
      DUST_FRONT_INTERNAL_API="http://localhost:3000" \
      NEXT_PUBLIC_DUST_CLIENT_FACING_URL="http://localhost:3000" \
      NEXT_PUBLIC_DUST_APP_URL="http://localhost:3011" \
      DUST_CLIENT_FACING_URL="http://localhost:3000" \
      DUST_AUTH_REDIRECT_BASE_URL="http://localhost:3000" \
      WORKOS_API_HOSTNAME="${WORKOS_HOST}:7600" \
      WORKOS_AUTHORIZE_HOSTNAME="${WORKOS_HOST}:7600" \
      WORKOS_API_KEY=fake-api-key \
      WORKOS_CLIENT_ID=fake-client-id \
      WORKOS_COOKIE_PASSWORD=change-me-to-32-char-password-xx \
      WORKOS_ISSUER_URL="http://${WORKOS_HOST}:7600" \
      WORKOS_WEBHOOK_SECRET=fake-webhook-secret \
      WORKOS_WEBHOOK_SIGNING_SECRET=fake-webhook-signing-secret \
      WORKOS_ACTION_SECRET=fake-action-secret \
      WORKOS_ACTION_SIGNING_SECRET=fake-action-signing-secret \
      WORKOS_ENVIRONMENT_ID=fake-env-id \
      REGION=us-central1 \
      NOVU_SECRET_KEY=fake-novu-key \
      DUST_INVITE_TOKEN_SECRET=change-me-to-random-secret-1234 \
      DUST_REGISTRY_SECRET=change-me-to-random-secret-1234 \
      DUST_CONNECTORS_SECRET=change-me-to-random-secret-1234 \
      DUST_CONNECTORS_WEBHOOKS_SECRET=change-me-to-random-secret \
      VIZ_JWT_SECRET=change-me-to-random-secret-1234 \
      DUST_ACADEMY_JWT_SECRET=change-me-to-random-secret \
      DUST_SANDBOX_JWT_SECRET=change-me-to-random-secret \
      EMAIL_WEBHOOK_SECRET=change-me-to-random-secret \
      EMAIL_VALIDATION_SECRET=change-me-to-random-secret \
      GATED_ASSETS_TOKEN_SECRET=change-me-to-random-secret \
      DUST_DEVELOPERS_SECRETS_SECRET=change-me-to-random-secret \
      DUST_MCP_SERVER_CREDENTIALS_SECRET=change-me-to-random \
      DUST_DEVELOPMENT_SYSTEM_API_KEY=change-me-to-random \
      DUST_DEVELOPMENT_WORKSPACE_ID=dev-workspace \
      GOOGLE_CLOUD_PROJECT_ID=fake-project \
      POKE_APP_URL="http://localhost:3000/poke" \
      VIZ_PUBLIC_URL="http://localhost:3100" \
      NEXT_PUBLIC_VIZ_URL="http://localhost:3100" \
      npm run dev
    ;;

  connectors)
    echo "Starting connectors on :3002..."
    cd "$SCRIPT_DIR/front"
    exec env \
      NODE_ENV=development \
      CONNECTORS_DATABASE_URI="postgres://dev:dev@${DB_HOST}:5432/dust_connectors" \
      CONNECTORS_DATABASE_READ_REPLICA_URI="postgres://dev:dev@${DB_HOST}:5432/dust_connectors" \
      CONNECTORS_PUBLIC_URL="http://localhost:3002" \
      DUST_FRONT_API="http://localhost:3000" \
      DUST_FRONT_INTERNAL_API="http://localhost:3000" \
      DUST_CLIENT_FACING_URL="http://localhost:3000" \
      OAUTH_API="http://localhost:3006" \
      TEXT_EXTRACTION_URL="http://${TIKA_HOST}:9998" \
      TEMPORAL_NAMESPACE=default \
      TEMPORAL_ADDRESS="${TEMPORAL_HOST}:7233" \
      npm run dev
    ;;

  stop)
    echo "Stopping infrastructure services..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" down
    echo "Done."
    ;;

  *)
    echo "Usage: ./dev.sh {infra|initdb|core|oauth|front|connectors|stop}"
    echo ""
    echo "  infra       Start infrastructure services in Docker"
    echo "  initdb      Initialize front database tables (first time only)"
    echo "  core        Run core (Rust) API locally on :3001"
    echo "  oauth       Run OAuth service locally on :3006"
    echo "  front       Run front (Next.js) locally on :3000"
    echo "  connectors  Run connectors locally on :3002"
    echo "  stop        Stop all Docker services"
    ;;

esac
