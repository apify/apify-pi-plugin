import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { normalizeSecretInput } from "../security/normalize.ts";
import { DEFAULT_BASE_URL, MAX_RESULT_CHARS } from "./constants.ts";

export const APIFY_ACTIONS = ["discover", "start", "collect"] as const;
export type ApifyAction = (typeof APIFY_ACTIONS)[number];

export interface ApifyConfig {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  enabledTools?: ApifyAction[] | null;
}

const DEFAULT_CONFIG: ApifyConfig = {
  baseUrl: DEFAULT_BASE_URL,
  maxResults: MAX_RESULT_CHARS,
  enabledTools: null,
};

// Fields a project config may not set: a cloned repository must not be able to
// supply its own key or redirect the user's key to another host.
const GLOBAL_ONLY_FIELDS = ["apiKey", "baseUrl"] as const;

/**
 * Get the global config file path. Follows pi's PI_CODING_AGENT_DIR override.
 */
export function getGlobalConfigPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "apify.json");
}

/**
 * Get the project config file path.
 */
export function getProjectConfigPath(): string {
  return join(process.cwd(), ".pi", "apify.json");
}

/**
 * Merge two config objects. Fields set in `override` win.
 */
function mergeConfig(base: ApifyConfig, override: ApifyConfig): ApifyConfig {
  const merged: ApifyConfig = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Keep only known config fields with valid values. Invalid fields are dropped with a warning.
 */
function sanitizeConfig(raw: unknown, path: string): ApifyConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.warn(`Apify: ignoring ${path}: expected a JSON object`);
    return {};
  }

  const input = raw as Record<string, unknown>;
  const config: ApifyConfig = {};
  const drop = (key: string, expected: string) =>
    console.warn(`Apify: ignoring "${key}" in ${path}: expected ${expected}`);

  if (input.enabled !== undefined) {
    if (typeof input.enabled === "boolean") config.enabled = input.enabled;
    else drop("enabled", "true or false");
  }
  if (input.apiKey !== undefined) {
    if (typeof input.apiKey === "string" && input.apiKey.trim()) config.apiKey = input.apiKey;
    else drop("apiKey", "a non-empty string");
  }
  if (input.baseUrl !== undefined) {
    if (typeof input.baseUrl === "string") config.baseUrl = input.baseUrl;
    else drop("baseUrl", "a string");
  }
  if (input.maxResults !== undefined) {
    if (typeof input.maxResults === "number" && Number.isInteger(input.maxResults) && input.maxResults > 0) {
      config.maxResults = input.maxResults;
    } else {
      drop("maxResults", "a positive whole number of characters");
    }
  }
  if (input.enabledTools !== undefined) {
    const value = input.enabledTools;
    const isActionList = Array.isArray(value)
      && value.every((action) => (APIFY_ACTIONS as readonly unknown[]).includes(action));
    if (value === null || isActionList) config.enabledTools = value as ApifyAction[] | null;
    else drop("enabledTools", `null or a list of ${APIFY_ACTIONS.join(", ")}`);
  }

  return config;
}

/**
 * Load config from a file path.
 * Returns empty object if file doesn't exist or can't be parsed.
 */
function loadConfigFile(path: string): ApifyConfig {
  try {
    if (!existsSync(path)) {
      return {};
    }
    const content = readFileSync(path, "utf-8");
    return sanitizeConfig(JSON.parse(content), path);
  } catch (error) {
    console.error(`Failed to load config from ${path}:`, error);
    return {};
  }
}

/**
 * Read only the global config file, without defaults or project overrides.
 * Use this when writing the global config back.
 */
export function readGlobalConfig(): ApifyConfig {
  return loadConfigFile(getGlobalConfigPath());
}

/**
 * Load merged configuration: defaults, then global config, then project config.
 * The project config cannot set apiKey or baseUrl.
 */
export function loadConfig(): ApifyConfig {
  const projectPath = getProjectConfigPath();
  const projectConfig = loadConfigFile(projectPath);
  for (const field of GLOBAL_ONLY_FIELDS) {
    if (projectConfig[field] !== undefined) {
      console.warn(`Apify: ignoring "${field}" in ${projectPath}: it can only be set in ${getGlobalConfigPath()}`);
      delete projectConfig[field];
    }
  }

  return mergeConfig(mergeConfig(DEFAULT_CONFIG, readGlobalConfig()), projectConfig);
}

/**
 * Whether the integration is on: explicit `enabled: false` always wins,
 * otherwise it's on if and only if an API key is available (config or env var).
 */
export function isEnabled(config: ApifyConfig): boolean {
  if (config.enabled === false) {
    return false;
  }
  return Boolean(resolveApiKey(config));
}

/**
 * Write config to a file that only the current user can read (0600).
 * Creates parent directories if needed.
 */
export function writeConfig(path: string, config: ApifyConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  // `mode` only applies when the file is created, so also fix an existing file
  chmodSync(path, 0o600);
}

/**
 * Write config to the global config file.
 */
export function writeGlobalConfig(config: ApifyConfig): void {
  writeConfig(getGlobalConfigPath(), config);
}

/**
 * Resolve the API key from config or environment, normalized.
 * Returns undefined if not found.
 */
export function resolveApiKey(config: ApifyConfig): string | undefined {
  const key = config.apiKey || process.env.APIFY_API_KEY;
  if (!key) {
    return undefined;
  }
  return normalizeSecretInput(key) || undefined;
}
