import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach } from "vitest";

/**
 * Run each test with an isolated global config dir (PI_CODING_AGENT_DIR),
 * an empty project dir as cwd, and no APIFY_API_KEY in the environment.
 */
export function useIsolatedConfig(): { agentDir: () => string; projectDir: () => string } {
  let agentDir = "";
  let projectDir = "";
  const saved = { cwd: process.cwd(), agentDir: process.env.PI_CODING_AGENT_DIR, key: process.env.APIFY_API_KEY };

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "apify-pi-test-"));
    agentDir = join(root, "agent");
    projectDir = join(root, "project");
    process.env.PI_CODING_AGENT_DIR = agentDir;
    delete process.env.APIFY_API_KEY;
    mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(saved.cwd);
    restoreEnv("PI_CODING_AGENT_DIR", saved.agentDir);
    restoreEnv("APIFY_API_KEY", saved.key);
  });

  return { agentDir: () => agentDir, projectDir: () => projectDir };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
