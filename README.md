# Apify Pi plugin

Universal Apify Actor integration for the Pi agent. Run any web scraping or automation Actor from Apify Store through a single tool.

## Installation

First, install the plugin dependencies:

```bash
cd apify-pi-plugin
npm install --ignore-scripts
```

Then register the plugin with Pi using one of these methods:

### Primary method: Persistent installation

```bash
# Local path installation (for development)
pi install ./apify-pi-plugin

# OR npm registry installation (once published)
pi install npm:apify-pi-plugin
```

After installation, the plugin will be automatically loaded in every Pi session:

```bash
pi  # Start a session - the apify tool and /apify commands are auto-loaded
```

### Alternative: Per-invocation load

For one-time use without persistent installation:

```bash
pi -e apify-pi-plugin
```

## Configuration

### Quick start

Run the interactive setup:

```
/apify login
```

This asks for your API token (hidden as you type), checks it, and asks before saving it to `~/.pi/agent/apify.json`. Only your user account can read that file. Get your token in [Apify Console](https://console.apify.com/settings/integrations?utm_source=pi&utm_medium=integration).

If you set `PI_CODING_AGENT_DIR`, the plugin uses `$PI_CODING_AGENT_DIR/apify.json` instead.

The `apify` tool is only registered when an API token is available, so a fresh install adds nothing to your agent until you log in.

### Manual configuration

Config files are loaded from (in order of precedence):
1. Project: `<cwd>/.pi/apify.json` (overrides global, except `apiKey` and `baseUrl`)
2. Global: `~/.pi/agent/apify.json`

A project config can't set `apiKey` or `baseUrl`. Otherwise a cloned repository could send your token to another server. Those two fields are ignored with a warning.

Example config:

```json
{
  "enabled": true,
  "apiKey": "apify_api_...",
  "baseUrl": "https://api.apify.com",
  "maxResults": 50000,
  "enabledTools": null
}
```

| Field | Meaning |
|---|---|
| `enabled` | `false` turns the integration off. If unset, it's on whenever an API token is available. |
| `apiKey` | Your Apify API token. Global config only. |
| `baseUrl` | Must be `https://api.apify.com`. Anything else is rejected. Global config only. |
| `maxResults` | Maximum characters of dataset output per `collect` call, shared across all runs. Default `50000`. The agent can lower it but not raise it. |
| `enabledTools` | `null` for all actions, or a list of `discover`, `start`, `collect`. |

Invalid values are ignored with a warning.

### Environment variables

You can also set your API key via environment variable:

```bash
export APIFY_API_KEY=apify_api_...
```

## Usage

The plugin registers a single `apify` tool with three actions:

### 1. Discover: search for Actors or get schemas

Search Apify Store:
```
Use the apify tool with action="discover" and query="instagram scraper"
```

Get an Actor's input schema:
```
Use the apify tool with action="discover" and actorId="apify~instagram-scraper"
```

### 2. Start: launch Actor runs

Start an Actor run (returns immediately):
```
Use the apify tool with action="start", actorId="apify~instagram-scraper",
and input={"usernames": ["nike", "adidas"], "resultsLimit": 10}
```

### 3. Collect: poll runs and fetch results

Poll run status and collect results:
```
Use the apify tool with action="collect" and runReferences=[{
  "runId": "abc123",
  "actorId": "apify~instagram-scraper",
  "datasetId": "def456"
}]
```

Keep calling collect with pending run references until `allDone` is true.

`collect` returns at most 100 items per run and tells you the dataset's real size (for example, "showing 100 of 2500 items"). All dataset output in one call shares the `maxResults` character budget. If polling a run fails temporarily, the run stays pending, so the next `collect` call retries it.

## Workflow example

Here's a complete workflow:

1. **Search for an Actor:**
   ```
   Find an Instagram scraper on Apify
   ```

2. **Get the Actor's schema:**
   ```
   Show me the input schema for apify~instagram-scraper
   ```

3. **Start a run:**
   ```
   Scrape Instagram profiles for Nike and Adidas using apify~instagram-scraper
   ```

4. **Collect results:**
   ```
   Check the status of my Apify runs and get the results
   ```

## Slash commands

- `/apify login`: Set up your API token interactively
- `/apify status`: Check authentication and configuration
- `/apify test`: Test the connection to Apify (doesn't start an Actor run)
- `/apify help`: Show usage information

In the terminal UI, `/apify login` hides the token as you type. In RPC mode the client renders the input dialog, so masking is up to the client. In other modes the token is visible while typing.

## Key features

- **Universal tool**: One tool covers every Actor in Apify Store
- **Two-phase async**: Non-blocking start/collect pattern
- **Batching support**: Send multiple inputs in one run
- **Security**: Content wrapping, key fingerprinting, SSRF protection
- **Auto-discovery**: Search the Store or inspect schemas on demand

## Actor slug format

Always use tilde (`~`) not slash (`/`) in Actor slugs. Actor IDs also work.
- ✅ Correct: `apify~instagram-scraper`
- ✅ Correct: `moJRLRc85AitArpNN` (Actor ID)
- ❌ Wrong: `apify/instagram-scraper`

## Known Actors

The tool includes a curated catalog of popular Actors:

- **Instagram**: `apify~instagram-scraper`, `apify~instagram-profile-scraper`, etc.
- **Facebook**: `apify~facebook-pages-scraper`, `apify~facebook-posts-scraper`, etc.
- **TikTok**: `clockworks~tiktok-scraper`, `clockworks~tiktok-profile-scraper`, etc.
- **YouTube**: `streamers~youtube-scraper`, `streamers~youtube-channel-scraper`, etc.
- **Google Maps**: `compass~crawler-google-places`, `compass~google-maps-extractor`, etc.

See the full list in the tool description.

## Security

The plugin implements multiple security measures:

1. **Prompt injection defense**: Wraps all third-party text in untrusted-content markers: dataset rows, Actor READMEs and input schemas, Apify Store listings, and run status messages
2. **Credential protection**: Never shows full API tokens, only fingerprints. The config file is saved with `0600` permissions.
3. **Token exfiltration guard**: `baseUrl` must be exactly `https://api.apify.com`, and a project config can't set `apiKey` or `baseUrl`
4. **Input sanitization**: Strips newlines and line separators from API tokens before any use

## Development

```bash
# Install dependencies
npm install

# Type check
npm run check

# Run unit tests (vitest)
npm test

# Optional: an isolated pi in .pi-install/ for manual testing (never touches ~/.pi)
npm run setup:pi
npm run cleanup:pi
```

The dev dependencies pin the pi packages to the version the plugin is tested against (currently 1.5.0). At runtime, pi provides these packages itself, which is why they're `peerDependencies`.

## Project structure

The plugin is organized into purpose-named feature folders under `src/`, each
concern in its own module with a barrel `index.ts` where a folder groups several
files:

```
index.ts                  # extension entry point (registers tool, command, hook)
src/
  tool.ts                 # the universal `apify` tool definition
  actions/                # tool action layer
    index.ts              #   barrel re-exporting the router
    execute.ts            #   apifyExecute router (config gate → handler dispatch)
    discover.ts           #   discover action (search / schema)
    start.ts              #   start action (launch a run)
    collect.ts            #   collect action (poll runs and fetch datasets)
  commands/               # /apify slash-command handlers
    index.ts              #   barrel re-exporting the three commands
    login.ts              #   /apify login
    status.ts             #   /apify status
    test.ts               #   /apify test
    secret-input.ts       #   masked token input for /apify login
  security/               # input/output safety helpers
    index.ts              #   barrel re-exporting base-url, normalize + wrap
    base-url.ts           #   baseUrl allowlist (token exfiltration guard)
    normalize.ts          #   secret normalization, Actor slug/ID validation, fingerprint
    wrap.ts               #   untrusted-content wrapping (prompt-injection defense)
  utils/                  # single-concern helpers, one flat file each
    config.ts             #   config load / merge / resolve
    client.ts             #   ApifyClient creation + connectivity check
    constants.ts          #   shared constants (limits, markers, known Actors)
    errors.ts             #   error message helper
    types.ts              #   shared TypeScript interfaces
test/                     # vitest unit tests
```

## License

ISC