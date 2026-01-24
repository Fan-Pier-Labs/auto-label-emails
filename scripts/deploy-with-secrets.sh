#!/bin/bash
set -e

echo "=== Setting up AWS Secrets Manager ==="
bun run scripts/setup-secrets.ts

if [ $? -ne 0 ]; then
  echo "Error: Failed to setup secrets"
  exit 1
fi

echo ""
echo "=== Deploying to AWS Fargate ==="
bun run deploy

