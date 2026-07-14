---
name: pi-plugin-validation
description: Validation harness for the apify-pi-plugin. Build, install, configure, and test the Apify plugin against a running pi agent. Uses pi -p one-shot mode and tmux for interactive commands. Used by the validator agent after the coder agent completes implementation. Triggers: "validate apify plugin", "test pi plugin", "verify apify integration".
---

# Pi Apify Plugin Validation

The validator agent runs this skill after the coder agent has implemented
`apify-pi-plugin` per `PI_PLUGIN_TICKET.md`.

**The validator uses the real pi binary, not headless SDK.** Functional tests
use one-shot `pi -p` mode. Interactive commands use tmux. This validates the
plugin exactly as an end user would experience it.

## Preconditions

- The coder agent has produced a working `apify-pi-plugin/` directory with an
  `index.ts` entry, `package.json` with `"pi": { "extensions": ["."] }`, and
  all required source files per the ticket's §8 File structure.
- A `.env` file exists in the plugin repo root containing
  `APIFY_API_KEY=apify_api_...`.
- The pi monorepo at `/Users/gokdenizkaymak/apify/pi` passes `npm run check`.
- An LLM API key is configured for pi (via `~/.pi/agent/auth.json` or
  provider-specific env var like `ANTHROPIC_API_KEY`). The validator reuses
  whatever provider/model is already configured.

## Phase 0: Locate the pi binary and load config

```bash
# Find the pi binary (built from monorepo)
PI_BIN=$(which pi 2>/dev/null || echo "/Users/gokdenizkaymak/apify/pi/packages/coding-agent/dist/cli.js")
echo "Using pi: $PI_BIN"

# Load Apify API key from .env
cd /path/to/apify-pi-plugin
export APIFY_API_KEY=$(grep APIFY_API_KEY .env | cut -d'=' -f2)
echo "Apify key loaded (first 12): ${APIFY_API_KEY:0:12}..."

# Set the plugin path
PLUGIN_PATH="/path/to/apify-pi-plugin"

# Install plugin dependencies
cd "$PLUGIN_PATH"
npm install --ignore-scripts

# Register the plugin persistently with pi
echo "Installing plugin via pi install..."
pi install "$PLUGIN_PATH" 2>&1 | tail -5

# Verify installation
pi list 2>&1 | grep -q "$PLUGIN_PATH" && echo "Plugin registered successfully"

# For functional scenarios, we can now use bare pi (no -e flag needed)
PI_CMD="pi --tools apify,read,bash,write -p"
# For legacy/fallback testing with -e flag
PI_CMD_LEGACY="$PI_BIN -e $PLUGIN_PATH/index.ts --tools apify,read,bash,write -p"
```

## Phase 1: Build the plugin

```bash
cd /path/to/apify-pi-plugin
npm install --ignore-scripts
```

Verify it compiles:

```bash
npx tsc --noEmit
# If no tsconfig.json, verify module loads:
node --experimental-strip-types --no-warnings \
  -e "import('./index.ts').then(m => console.log('OK: module loaded'))"
```

## Phase 2: Configure the Apify API key

The validator writes the config file directly. This is equivalent to what
`/apify login` does after the user pastes their key, but scriptable.

```bash
mkdir -p ~/.pi/agent
cat > ~/.pi/agent/apify.json << APIFYEOF
{
  "apiKey": "${APIFY_API_KEY}"
}
APIFYEOF
```

Verify the config file was written:

```bash
cat ~/.pi/agent/apify.json | python3 -c "import sys,json; c=json.load(sys.stdin); print(f'Key present: {bool(c.get(\"apiKey\"))}, length: {len(c.get(\"apiKey\",\"\"))}')"
```

## Phase 3: Validation scenarios

All functional tests use one-shot `pi -p` mode. With persistent installation
(from Phase 0), the plugin is auto-loaded. The `apify` tool is explicitly
enabled via `--tools`.

Common flags for all scenarios:

```bash
# Primary: Using persistent installation (plugin auto-loaded)
PI_CMD="pi --tools apify,read,bash,write -p"

# Fallback: Using per-invocation -e flag (for comparison/legacy testing)
PI_CMD_LEGACY="$PI_BIN -e /path/to/apify-pi-plugin/index.ts --tools apify,read,bash,write -p"
```

The validator must **wait for pi to exit** (one-shot mode exits after the prompt
is fully processed) and capture stdout. Expect 5-60 seconds depending on the
prompt complexity and model speed.

### Scenario 0: Persistent install + auto-load

**Purpose**: Verify the persistent installation works and the plugin auto-loads in bare pi sessions.

**Commands**:
```bash
# Step 1: Confirm pi install works
pi install --help 2>&1 | head -20
# Expected: Shows usage including "pi install ./local/path", exit code 0

# Step 2: Install the plugin (should already be done in Phase 0)
PLUGIN_PATH="/path/to/apify-pi-plugin"
pi install "$PLUGIN_PATH" 2>&1 | tail -20
# Expected: Exit code 0, output indicates extension was added

# Step 3: Verify settings.json was updated
cat ~/.pi/agent/settings.json 2>&1 | grep -i 'apify'
# Expected: At least one match referencing apify-pi-plugin or plugin path

# Step 4: pi list shows the plugin
pi list 2>&1
# Expected: Output lists the plugin path

# Step 5: Bare pi registers the apify tool (using fallback if --list-tools doesn't exist)
echo "list your available tools" | pi -p 2>&1 | grep -i 'apify'
# Expected: At least one match containing 'apify'

# Step 6: /apify status works in bare session (requires apify.json from Phase 2)
echo "Run the /apify status command and report its output." | pi -p 2>&1 | tail -15
# Expected: Output contains userId/plan, no full API key visible

# Step 7: Clean removal
pi remove "$PLUGIN_PATH" 2>&1 | tail -10
# Expected: Exit code 0

# Verify removal
pi list 2>&1 | grep -i 'apify' || echo "NO MATCHES (expected)"
echo "list your available tools" | pi -p 2>&1 | grep -i 'apify' || echo "NO MATCHES (expected)"
# Expected: Both show "NO MATCHES (expected)"

# Step 8: Reinstall for remaining tests
pi install "$PLUGIN_PATH" 2>&1 | tail -5
```

**Pass conditions**:
- pi install command exists and accepts local paths
- Plugin appears in pi list after installation
- apify tool is available in bare pi sessions
- Plugin can be cleanly removed and reinstalled

### Scenario 1: Tool registration

**Purpose**: Verify the `apify` tool is registered and pi knows about it.

**Commands** (test both persistent and per-invocation modes):
```bash
# Using persistent install (primary)
echo "list your available tools" | pi -p 2>&1 | grep -i 'apify'

# Using -e flag (fallback/legacy)
echo "list your available tools" | $PI_BIN -e /path/to/apify-pi-plugin/index.ts -p 2>&1 | grep -i 'apify'
```

**Pass**: Both commands show output that includes `apify`. Does NOT return "no such tool" or empty result.

### Scenario 2: Discover — search mode

**Purpose**: Verify discover/search returns Actor listings with tilde slugs and a `tip:`.

**Command** (one-shot):
```bash
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and query='instagram scraper' to search the Apify Store. Report the top 3 results including their slugs (must use ~ not /). Confirm the response ends with a 'tip:' suggestion."
```

**Pass conditions** (grep the output):
- Contains `username~actor-name` (tilde format)
- Contains `tip:`
- Does NOT contain `apify/` (slash format)

### Scenario 3: Discover — schema mode

**Purpose**: Verify discover/schema returns input schema and README for a known Actor.

**Command**:
```bash
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and actorId='apify~web-scraper-puppeteer' to fetch the input schema. Tell me what input fields it requires and confirm the response ends with a 'tip:' that mentions action=start."
```

**Pass conditions**:
- Output describes `startUrls` or equivalent input fields
- Contains `tip:`
- Contains `action="start"` or `action=start`

### Scenario 4: Start — non-blocking

**Purpose**: Verify start returns immediately with a run reference.

**Command**:
```bash
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=start, actorId='apify~web-scraper-puppeteer', and input={ startUrls: [{ url: 'https://example.com' }] } to launch a scrape. The start call must return immediately (NOT wait for the run to finish). Report the runId and datasetId from the response."
```

**Pass conditions**:
- Output contains `runId`
- Output contains `datasetId`
- Output does NOT contain dataset rows (no scraped content in start response)

### Scenario 5: Collect — polling

**Purpose**: Verify collect returns correct terminal/pending/error buckets.

**Procedure**:
1. Capture the runId and datasetId from Scenario 4's output
2. Run collect in one-shot, passing the run reference

**Command**:
```bash
# After Scenario 4 succeeds with runId=RUN_ID and datasetId=DS_ID:
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash,write \
  -p "Use the apify tool with action=collect and runReferences=[{ runId: 'RUN_ID', actorId: 'apify~web-scraper-puppeteer', datasetId: 'DS_ID' }] to check the status of the run. Report whether it completed and how many items were scraped."
```

Note: if the run is still `RUNNING`, wait 10s and retry. The validator may need
to run this command 2-3 times until `allDone: true`.

**Pass conditions**:
- Output mentions the run status (SUCCEEDED / RUNNING / FAILED)
- If succeeded: output includes item count
- Content contains `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` wrapping markers

### Scenario 6: Content wrapping

**Purpose**: Verify untrusted-content markers are present and correctly formatted.

**Command** (combine with Scenario 5 collect output):
```bash
# Search the output of Scenario 5 for markers
echo "$COLLECT_OUTPUT" | grep -c "<<<EXTERNAL_UNTRUSTED_CONTENT>>>"
echo "$COLLECT_OUTPUT" | grep -c "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>"
echo "$COLLECT_OUTPUT" | grep -c "Source: apify:"
```

**Pass conditions**:
- Open marker count equals close marker count
- Both are >= 1
- `Source: apify:apify~web-scraper-puppeteer` appears

### Scenario 7: Error — missing key

**Purpose**: Verify structured error (not a crash) when no key is configured.

**Command**:
```bash
# Temporarily remove the key
mv ~/.pi/agent/apify.json ~/.pi/agent/apify.json.bak
unset APIFY_API_KEY

$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and query='test'." 2>&1 | head -50

# Restore
mv ~/.pi/agent/apify.json.bak ~/.pi/agent/apify.json
export APIFY_API_KEY=$(grep APIFY_API_KEY /path/to/apify-pi-plugin/.env | cut -d'=' -f2)
```

**Pass conditions**:
- Output contains `missing_credential` or "not configured"
- pi does NOT crash (command exit code 0 or small non-zero)

### Scenario 8: Error — invalid slug format

**Purpose**: Verify slash-based slugs are rejected.

**Command**:
```bash
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and actorId='apify/instagram-scraper' (using slash). Report the error." 2>&1
```

**Pass conditions**:
- Output indicates error or invalidity for the slug
- Suggests tilde format

### Scenario 9: SSRF guard — baseUrl allowlist

**Purpose**: Verify non-Apify baseUrl values are rejected.

**Command**:
```bash
# Write malicious config
cat > ~/.pi/agent/apify.json << BADEOF
{
  "apiKey": "${APIFY_API_KEY}",
  "baseUrl": "https://evil.example.com"
}
BADEOF

$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and query='test'." 2>&1 | head -30

# Restore valid config
cat > ~/.pi/agent/apify.json << GOODEOF
{
  "apiKey": "${APIFY_API_KEY}"
}
GOODEOF
```

**Pass conditions**:
- Output contains `invalid_base_url` or "baseUrl" error
- Does NOT make any request to `evil.example.com`

### Scenario 10: Kill switch — `enabled: false`

**Purpose**: Verify the hard kill switch.

**Command**:
```bash
cat > ~/.pi/agent/apify.json << KILLEOF
{
  "apiKey": "${APIFY_API_KEY}",
  "enabled": false
}
KILLEOF

$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Use the apify tool with action=discover and query='test'." 2>&1 | head -30

# Restore
cat > ~/.pi/agent/apify.json << GOODEOF
{
  "apiKey": "${APIFY_API_KEY}"
}
GOODEOF
```

**Pass conditions**:
- Output indicates plugin is disabled, OR the tool is unavailable
- Does NOT execute any Apify API call

### Scenario 11: Slash commands — `/apify status` and `/apify test`

**Purpose**: Verify `/apify status` and `/apify test` respond correctly via one-shot.

These commands are pi slash commands, which means they run inside an active
pi session. Use one-shot mode to invoke them:

```bash
# /apify status
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Run the /apify status command and report the output. Confirm it shows authentication info without exposing the full API key." 2>&1

# /apify test
$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash \
  -p "Run the /apify test command and report the output. Confirm connectivity to Apify is working." 2>&1
```

**Pass conditions**:
- `/apify status` output mentions userId or plan, AND does NOT contain the full
  API key string (max 12 chars visible)
- `/apify test` output confirms connectivity

### Scenario 12: `/apify login` — interactive test via tmux

**Purpose**: Verify the interactive `/apify login` command flow (masked input,
validates, writes config, never echoes full key).

This test uses tmux per the AGENTS.md testing pattern. The validator must:

1. Remove existing config to force a clean login
2. Start pi in a tmux session
3. Send `/apify login`
4. Type the API key (from `.env`) at the masked prompt
5. Capture the pane output
6. Verify config was written and the key was NOT echoed

```bash
# 1. Remove existing config
rm -f ~/.pi/agent/apify.json

# 2. Start tmux session with pi + extension loaded
tmux new-session -d -s apify-login-test -x 100 -y 30
tmux send-keys -t apify-login-test \
  "$PI_BIN -e /path/to/apify-pi-plugin/index.ts --tools apify,read,bash" Enter

# 3. Wait for pi to start (check for prompt)
sleep 4
tmux capture-pane -t apify-login-test -p | tail -5

# 4. Send the /apify login command
tmux send-keys -t apify-login-test "/apify login" Enter

# 5. Wait for the key prompt, then send the key
sleep 2
tmux send-keys -t apify-login-test "${APIFY_API_KEY}" Enter

# 6. Wait for validation and config write
sleep 3

# 7. Capture full pane output
tmux capture-pane -t apify-login-test -p > /tmp/apify-login-output.txt

# 8. Kill tmux session
tmux kill-session -t apify-login-test
```

**Pass conditions** (check `/tmp/apify-login-output.txt`):
- Contains "Authenticated" or userId
- Contains "Key saved" or equivalent
- Does NOT contain the full API key string anywhere in the captured output
- Config file was written:
  ```bash
  test -f ~/.pi/agent/apify.json && echo "PASS: config written"
  cat ~/.pi/agent/apify.json | python3 -c "import sys,json; c=json.load(sys.stdin); print(f'Key stored: {bool(c.get(\"apiKey\"))}')"
  ```

### Scenario 13: Full workflow — discover → start → collect

**Purpose**: End-to-end test of the complete three-primitive workflow.

This is the most important scenario. Run it as a single one-shot prompt that
exercises all three actions:

```bash
RUN_ID_FILE=/tmp/apify-test-runid.txt
DS_ID_FILE=/tmp/apify-test-dsid.txt

$PI_BIN -e /path/to/apify-pi-plugin/index.ts \
  --tools apify,read,bash,write \
  -p "Do the following steps, reporting results after each:
1. Use apify with action=discover and actorId='apify~web-scraper-puppeteer' to see its input schema.
2. Based on the schema, use apify with action=start, actorId='apify~web-scraper-puppeteer', and input={ startUrls: [{ url: 'https://example.com' }] } to launch a scrape. Note the runId and datasetId.
3. Wait 15 seconds, then use apify with action=collect with the run reference to check and retrieve results.
4. Confirm the collected data is wrapped in untrusted-content markers." 2>&1
```

**Pass conditions** (all must be present in output):
- Schema response from step 1 includes `startUrls` or input fields
- Start response from step 2 includes `runId` and `datasetId`
- Collect response from step 3 includes item count or dataset content
- Output contains `<<<EXTERNAL_UNTRUSTED_CONTENT>>>`
- Output contains `<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>`
- Output contains `Source: apify:`

## Phase 4: Testing modes

The validation harness tests the plugin in two modes to ensure both work:

1. **Persistent installation (primary)**: Plugin installed via `pi install` and
   auto-loaded in all sessions. This is the recommended user flow.

2. **Per-invocation load (fallback)**: Plugin loaded via `-e` flag for each
   command. This is kept as a secondary testing matrix to ensure backward
   compatibility and as an advanced option for users.

For scenarios 2-13, the validator should test with the persistent installation
first (using bare `pi`), and optionally re-test critical scenarios with the
`-e` flag to ensure both modes work correctly.

## Phase 5: Cleanup

```bash
# Remove persistent installation
PLUGIN_PATH="/path/to/apify-pi-plugin"
pi remove "$PLUGIN_PATH" 2>&1

# Clean up config files
rm -f ~/.pi/agent/apify.json
rm -f /tmp/apify-login-output.txt /tmp/apify-test-runid.txt /tmp/apify-test-dsid.txt
```

Note: any test runs created on Apify during validation remain on the account
and are billed accordingly. Use cheap/small Actors (`apify~web-scraper-puppeteer`
with one URL to `example.com`) to minimize cost.

## Environment requirements

- Node.js >= 20
- npm >= 9
- TypeScript >= 5.x
- Working pi CLI in the monorepo (`npm run check` passes at
  `/Users/gokdenizkaymak/apify/pi`)
- pi binary at `/Users/gokdenizkaymak/apify/pi/packages/coding-agent/dist/cli.js`
  (or system `pi` if installed)
- LLM API key configured for pi (provider-specific env var or auth.json)
- Valid Apify API key in the plugin repo's `.env` file
- tmux installed (`brew install tmux` if needed)