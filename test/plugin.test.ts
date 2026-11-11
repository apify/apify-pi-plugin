import { mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import plugin from "../index.ts";
import { apifyLoginCommand } from "../src/commands/login.ts";
import { getGlobalConfigPath, readGlobalConfig } from "../src/utils/config.ts";
import { useIsolatedConfig } from "./helpers.ts";

const dirs = useIsolatedConfig();

vi.mock("../src/utils/client.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/utils/client.ts")>();
  return {
    ...original,
    testConnectivity: vi.fn(async () => ({ success: true, userId: "tester", plan: "FREE" })),
  };
});

function fakePi() {
  const tools: string[] = [];
  return {
    tools,
    api: {
      registerTool: (tool: { name: string }) => tools.push(tool.name),
      registerCommand: () => {},
      on: () => {},
    } as any,
  };
}

function fakeCtx(answers: { input?: string; confirm?: boolean }) {
  return {
    mode: "rpc",
    ui: {
      notify: vi.fn(),
      input: vi.fn(async () => answers.input),
      confirm: vi.fn(async () => answers.confirm ?? false),
    },
  } as any;
}

describe("tool registration", () => {
  it("registers nothing without a key", () => {
    const pi = fakePi();
    plugin(pi.api);
    expect(pi.tools).toEqual([]);
  });

  it("registers the apify tool when a key is set (env var counts)", () => {
    process.env.APIFY_API_KEY = "env-key";
    const pi = fakePi();
    plugin(pi.api);
    expect(pi.tools).toEqual(["apify"]);
  });

  it("registers nothing when explicitly disabled", () => {
    mkdirSync(dirs.agentDir(), { recursive: true });
    writeFileSync(getGlobalConfigPath(), JSON.stringify({ apiKey: "k", enabled: false }));
    const pi = fakePi();
    plugin(pi.api);
    expect(pi.tools).toEqual([]);
  });
});

describe("/apify login", () => {
  it("asks before saving, saves only to the global file with 0600, and calls onSaved", async () => {
    // A project override must not end up in the global config
    mkdirSync(join(dirs.projectDir(), ".pi"), { recursive: true });
    writeFileSync(join(dirs.projectDir(), ".pi", "apify.json"), JSON.stringify({ enabledTools: ["discover"] }));

    const onSaved = vi.fn();
    const ctx = fakeCtx({ input: " apify_api_secret\n", confirm: true });
    await apifyLoginCommand(ctx, onSaved);

    expect(ctx.ui.confirm).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(readGlobalConfig()).toEqual({ apiKey: "apify_api_secret", enabled: true });
    expect(statSync(getGlobalConfigPath()).mode & 0o777).toBe(0o600);
    // The full key is never shown
    for (const [message] of ctx.ui.notify.mock.calls) {
      expect(message).not.toContain("apify_api_secret");
    }
    // The token link carries UTM params
    expect(ctx.ui.notify.mock.calls[0][0]).toContain("utm_source=pi");
  });

  it("doesn't save without consent", async () => {
    const onSaved = vi.fn();
    await apifyLoginCommand(fakeCtx({ input: "apify_api_secret", confirm: false }), onSaved);
    expect(onSaved).not.toHaveBeenCalled();
    expect(readGlobalConfig()).toEqual({});
  });
});
