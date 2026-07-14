import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export interface ApifyConfig {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  enabledTools?: string[] | null;
}

const DEFAULT_CONFIG: Partial<ApifyConfig> = {
  baseUrl: "https://api.apify.com",
  maxResults: 50000,
  enabledTools: null,
};

/**
 * Get the global config file path.
 */
export function getGlobalConfigPath(): string {
  return join(homedir(), ".pi", "agent", "apify.json");
}

/**
 * Get the project config file path.
 */
export function getProjectConfigPath(): string {
  return join(process.cwd(), ".pi", "apify.json");
}

/**
 * Deep merge two config objects.
 * Project config overrides global config.
 * Since ApifyConfig only has primitive and array types, we can simplify this.
 */
function deepMergeConfig(base: ApifyConfig, override: ApifyConfig): ApifyConfig {
  const merged: ApifyConfig = { ...base };

  // Simple merge since all fields are primitives or arrays
  if (override.enabled !== undefined) merged.enabled = override.enabled;
  if (override.apiKey !== undefined) merged.apiKey = override.apiKey;
  if (override.baseUrl !== undefined) merged.baseUrl = override.baseUrl;
  if (override.maxResults !== undefined) merged.maxResults = override.maxResults;
  if (override.enabledTools !== undefined) merged.enabledTools = override.enabledTools;

  return merged;
}

/**
 * Load config from a file path.
 * Returns empty object if file doesn't exist.
 */
function loadConfigFile(path: string): ApifyConfig {
  try {
    if (!existsSync(path)) {
      return {};
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load config from ${path}:`, error);
    return {};
  }
}

/**
 * Load merged configuration.
 * Merges global config, project config, and defaults.
 */
export function loadConfig(): ApifyConfig {
  // Start with defaults
  let config: ApifyConfig = { ...DEFAULT_CONFIG };

  // Load and merge global config
  const globalConfig = loadConfigFile(getGlobalConfigPath());
  config = deepMergeConfig(config, globalConfig);

  // Load and merge project config
  const projectConfig = loadConfigFile(getProjectConfigPath());
  config = deepMergeConfig(config, projectConfig);

  // Auto-enable if apiKey is present and enabled is not explicitly false
  if (config.apiKey && config.enabled === undefined) {
    config.enabled = true;
  }

  return config;
}

/**
 * Write config to a file.
 * Creates parent directories if needed.
 */
export function writeConfig(path: string, config: ApifyConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Write config to the global config file.
 */
export function writeGlobalConfig(config: ApifyConfig): void {
  writeConfig(getGlobalConfigPath(), config);
}

/**
 * Write config to the project config file.
 */
export function writeProjectConfig(config: ApifyConfig): void {
  writeConfig(getProjectConfigPath(), config);
}

/**
 * Resolve the API key from config or environment.
 * Returns undefined if not found.
 */
export function resolveApiKey(config: ApifyConfig): string | undefined {
  // 1. Check config
  if (config.apiKey) {
    return config.apiKey;
  }

  // 2. Check environment variable
  if (process.env.APIFY_API_KEY) {
    return process.env.APIFY_API_KEY;
  }

  return undefined;
}