# Apify Pi Plugin

Universal Apify Actor integration for the Pi agent. Access 20,000+ web scraping and automation Actors through a single tool.

## Installation

```bash
npm install apify-pi-plugin
```

Then add to your Pi agent extensions:

```bash
pi -e apify-pi-plugin
```

## Configuration

### Quick Start

Run the interactive setup:

```
/apify login
```

This will prompt for your API key, validate it, and save it to `~/.pi/agent/apify.json`.

### Manual Configuration

Config files are loaded from (in order of precedence):
1. Project: `<cwd>/.pi/apify.json` (overrides global)
2. Global: `~/.pi/agent/apify.json`

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

### Environment Variables

You can also set your API key via environment variable:

```bash
export APIFY_API_KEY=apify_api_...
```

## Usage

The plugin registers a single `apify` tool with three actions:

### 1. Discover - Search for Actors or get schemas

Search the Apify Store:
```
Use the apify tool with action="discover" and query="instagram scraper"
```

Get an Actor's input schema:
```
Use the apify tool with action="discover" and actorId="apify~instagram-scraper"
```

### 2. Start - Launch Actor runs

Start an Actor run (returns immediately):
```
Use the apify tool with action="start", actorId="apify~instagram-scraper",
and input={"usernames": ["nike", "adidas"], "resultsLimit": 10}
```

### 3. Collect - Poll runs and fetch results

Poll run status and collect results:
```
Use the apify tool with action="collect" and runReferences=[{
  "runId": "abc123",
  "actorId": "apify~instagram-scraper",
  "datasetId": "def456"
}]
```

Keep calling collect with pending run references until `allDone` is true.

## Workflow Example

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

## Slash Commands

- `/apify login` - Configure your API key interactively
- `/apify status` - Check authentication and configuration
- `/apify test` - Test connectivity and run a simple Actor
- `/apify help` - Show usage information

## Key Features

- **Universal tool**: One tool wraps all 20,000+ Actors
- **Two-phase async**: Non-blocking start/collect pattern
- **Batching support**: Send multiple inputs in one run
- **Security**: Content wrapping, key fingerprinting, SSRF protection
- **Auto-discovery**: Search the Store or inspect schemas on demand

## Actor Slug Format

Always use tilde (`~`) not slash (`/`) in Actor slugs:
- ✅ Correct: `apify~instagram-scraper`
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

1. **Prompt injection defense**: Wraps scraped content in untrusted markers
2. **Credential protection**: Never logs full API keys, only fingerprints
3. **SSRF prevention**: Validates baseUrl starts with https://api.apify.com
4. **Input sanitization**: Strips dangerous whitespace from API keys

## Development

```bash
# Install dependencies
npm install

# Type check
npm run check

# Run tests (if available)
npm test
```

## License

ISC