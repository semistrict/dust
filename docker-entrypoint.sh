#!/bin/sh
# Resolve TEMPORAL_ADDRESS hostname to IP for Temporal SDK's native Rust gRPC client,
# which doesn't use Docker's embedded DNS resolver.
if [ -n "$TEMPORAL_ADDRESS" ]; then
  _HOST=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f1)
  _PORT=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f2)
  _IP=$(getent hosts "$_HOST" 2>/dev/null | awk '{print $1}')
  if [ -n "$_IP" ]; then
    export TEMPORAL_ADDRESS="${_IP}:${_PORT}"
    echo "[entrypoint] Resolved TEMPORAL_ADDRESS=$TEMPORAL_ADDRESS"
  else
    echo "[entrypoint] WARNING: Could not resolve host '$_HOST'"
  fi
fi
# Override NODE_ENV before exec since Next.js standalone forcefully sets NODE_ENV=production.
# Application code checks NODE_ENV to decide on Temporal TLS, auth flows, etc.
if [ "$IS_DEVELOPMENT" = "true" ]; then
  export NODE_ENV=development
fi

exec "$@"
