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

# Register the plugin persistently with pi
echo "Registering apify-pi-plugin with pi..."
if command -v pi >/dev/null 2>&1; then
  # Check if plugin is already installed
  if pi list 2>&1 | grep -q "apify-pi-plugin"; then
    echo "Plugin already registered with pi"
  else
    # Install the plugin using the local path
    pi install "$REPO_ROOT" 2>&1 | tail -5
    echo "Plugin registered. It will be auto-loaded in all pi sessions."
  fi
else
  echo "Warning: 'pi' command not found in PATH. Plugin not registered."
  echo "After adding pi to PATH, run: pi install $REPO_ROOT"
fi
