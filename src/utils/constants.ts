// The only Apify API origin the plugin will send the API key to
export const DEFAULT_BASE_URL = "https://api.apify.com";

// Maximum characters of dataset output per collect call (shared across all runs)
export const MAX_RESULT_CHARS = 50_000;

// Maximum number of dataset items fetched per run
export const MAX_ITEMS_PER_DATASET = 100;

// Maximum characters of an Actor's input schema and README shown by discover
export const MAX_SCHEMA_CHARS = 20_000;
export const MAX_README_CHARS = 3_000;

// Where users get their API token
export const CONSOLE_INTEGRATIONS_URL =
  "https://console.apify.com/settings/integrations?utm_source=pi&utm_medium=integrations";

// Untrusted content markers
export const EXTERNAL_CONTENT_START = "<<<EXTERNAL_UNTRUSTED_CONTENT>>>";
export const EXTERNAL_CONTENT_END = "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>";
