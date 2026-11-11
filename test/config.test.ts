import { chmodSync, mkdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { getGlobalConfigPath, isEnabled, loadConfig, readGlobalConfig, resolveApiKey, writeGlobalConfig } from "../src/utils/config.ts";
import { createClient } from "../src/utils/client.ts";
import { useIsolatedConfig } from "./helpers.ts";

const dirs = useIsolatedConfig();

function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

const projectConfigPath = () => join(dirs.projectDir(), ".pi", "apify.json");

describe("loadConfig", () => {
  it("uses PI_CODING_AGENT_DIR for the global config", () => {
    expect(getGlobalConfigPath()).toBe(join(dirs.agentDir(), "apify.json"));
  });

  it("lets the project config override ordinary settings", () => {
    writeJson(getGlobalConfigPath(), { apiKey: "global-key", maxResults: 1000 });
    writeJson(projectConfigPath(), { maxResults: 500, enabledTools: ["discover"] });
    expect(loadConfig()).toMatchObject({ apiKey: "global-key", maxResults: 500, enabledTools: ["discover"] });
  });

  it("ignores apiKey and baseUrl from the project config", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeJson(getGlobalConfigPath(), { apiKey: "global-key" });
    writeJson(projectConfigPath(), { apiKey: "repo-key", baseUrl: "https://api.apify.com.evil.com" });

    const config = loadConfig();
    expect(config.apiKey).toBe("global-key");
    expect(config.baseUrl).toBe("https://api.apify.com");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("drops invalid values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeJson(getGlobalConfigPath(), { apiKey: "k", enabled: "yes", maxResults: -1, enabledTools: "discover" });
    const config = loadConfig();
    expect(config.enabled).toBeUndefined();
    expect(config.maxResults).toBe(50_000);
    expect(config.enabledTools).toBeNull();
    warn.mockRestore();
  });
});

describe("isEnabled", () => {
  it("is off without a key", () => {
    expect(isEnabled(loadConfig())).toBe(false);
  });

  it("is on with a key from config or env", () => {
    process.env.APIFY_API_KEY = "env-key";
    expect(isEnabled(loadConfig())).toBe(true);
  });

  it("explicit enabled: false wins", () => {
    writeJson(getGlobalConfigPath(), { apiKey: "k", enabled: false });
    expect(isEnabled(loadConfig())).toBe(false);
  });
});

describe("resolveApiKey", () => {
  it("normalizes keys from env too", () => {
    process.env.APIFY_API_KEY = " env-key\n";
    expect(resolveApiKey({})).toBe("env-key");
  });
});

describe("writeGlobalConfig", () => {
  it("writes a file only the owner can read, also when it already exists", () => {
    writeJson(getGlobalConfigPath(), {});
    chmodSync(getGlobalConfigPath(), 0o644);

    writeGlobalConfig({ apiKey: "secret" });

    expect(statSync(getGlobalConfigPath()).mode & 0o777).toBe(0o600);
    expect(readGlobalConfig()).toEqual({ apiKey: "secret" });
    expect(JSON.parse(readFileSync(getGlobalConfigPath(), "utf-8"))).toEqual({ apiKey: "secret" });
  });
});

describe("createClient", () => {
  it("returns missing_credential without a key", () => {
    expect(createClient({})).toMatchObject({ ok: false, error: "missing_credential" });
  });

  it("returns invalid_base_url instead of throwing", () => {
    expect(createClient({ apiKey: "k", baseUrl: "https://api.apify.com.evil.com" }))
      .toMatchObject({ ok: false, error: "invalid_base_url" });
  });

  it("creates a client for the default origin", () => {
    expect(createClient({ apiKey: "k" })).toMatchObject({ ok: true, apiKey: "k" });
  });
});
