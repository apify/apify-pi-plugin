#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PI_DIR="$REPO_ROOT/.pi-install"

echo "=== Setting up pi ==="

mkdir -p "$PI_DIR"

echo "Installing pi..."
npm install --ignore-scripts --prefix "$PI_DIR" @earendil-works/pi-coding-agent

echo "Configuring OpenRouter provider..."
OPENROUTER_API_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$REPO_ROOT/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$OPENROUTER_API_KEY" ] || [ "$OPENROUTER_API_KEY" = "your_api_key_here" ]; then
  echo "Error: OPENROUTER_API_KEY not found or still placeholder in $REPO_ROOT/.env"
  exit 1
fi

mkdir -p ~/.pi/agent
cat > ~/.pi/agent/auth.json << AUTH_EOF
{
  "openrouter": {
    "type": "api_key",
    "key": "${OPENROUTER_API_KEY}"
  }
}
AUTH_EOF
chmod 600 ~/.pi/agent/auth.json

echo "pi setup complete (installed at $PI_DIR)"
