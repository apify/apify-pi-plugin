#!/usr/bin/env bash
# Set up an isolated pi for developing and validating this plugin.
# Everything lives in .pi-install/: the pi binary and its config dir (PI_CODING_AGENT_DIR).
# Your real ~/.pi/agent is never read or written.
set -euo pipefail

PI_VERSION="1.5.0"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PI_DIR="$REPO_ROOT/.pi-install"
export PI_CODING_AGENT_DIR="$PI_DIR/agent"
PI_BIN="$PI_DIR/node_modules/.bin/pi"
ENV_FILE="$REPO_ROOT/.env"

echo "=== Setting up pi $PI_VERSION in $PI_DIR ==="

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Create it with OPENROUTER_API_KEY=..."
  exit 1
fi
OPENROUTER_API_KEY=$(grep -E '^OPENROUTER_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
if [ -z "$OPENROUTER_API_KEY" ] || [ "$OPENROUTER_API_KEY" = "your_api_key_here" ]; then
  echo "Error: OPENROUTER_API_KEY not found or still placeholder in $ENV_FILE"
  exit 1
fi

mkdir -p "$PI_DIR"
echo "Installing pi..."
npm install --ignore-scripts --no-audit --no-fund --prefix "$PI_DIR" "@earendil-works/pi-coding-agent@$PI_VERSION"

echo "Configuring OpenRouter provider..."
mkdir -p "$PI_CODING_AGENT_DIR"
# umask so the file is never readable by others, not even briefly
(
  umask 077
  cat > "$PI_CODING_AGENT_DIR/auth.json" << AUTH_EOF
{
  "openrouter": {
    "type": "api_key",
    "key": "${OPENROUTER_API_KEY}"
  }
}
AUTH_EOF
)

echo "Registering apify-pi-plugin with the isolated pi..."
if "$PI_BIN" list 2>&1 | grep -q "apify-pi-plugin"; then
  echo "Plugin already registered"
else
  "$PI_BIN" install "$REPO_ROOT" 2>&1 | tail -5
fi

echo
echo "pi setup complete. To use it:"
echo "  export PI_CODING_AGENT_DIR=\"$PI_CODING_AGENT_DIR\""
echo "  \"$PI_BIN\""
echo "Remove it with: npm run cleanup:pi"
