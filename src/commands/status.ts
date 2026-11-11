import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../utils/client.ts";
import { loadConfig } from "../utils/config.ts";
import { DEFAULT_BASE_URL, MAX_RESULT_CHARS } from "../utils/constants.ts";
import { errorMessage } from "../utils/errors.ts";
import { fingerprintKey } from "../security/index.ts";

/**
 * Handle /apify status command.
 * Show current configuration and authentication status.
 */
export async function apifyStatusCommand(_args: string, ctx: ExtensionContext): Promise<void> {
  try {
    const config = loadConfig();

    const clientResult = createClient(config);
    if (!clientResult.ok) {
      ctx.ui.notify(`❌ ${clientResult.message}`, "error");
      return;
    }

    // Test connectivity
    ctx.ui.notify("Checking Apify connection...");
    const result = await testConnectivity(clientResult.client);

    if (result.success) {
      ctx.ui.notify(`✅ Authenticated as ${result.userId} (${result.plan} plan)`);
    } else {
      ctx.ui.notify(`⚠️ Authentication failed: ${result.error}`, "warning");
    }
    ctx.ui.notify(`Key fingerprint: ${fingerprintKey(clientResult.apiKey)}`);

    // Show enabled status
    if (config.enabled === false) {
      ctx.ui.notify("⚠️ Apify integration is disabled in config", "warning");
    } else {
      ctx.ui.notify("✅ Apify integration is enabled");
    }

    // Show enabled actions
    if (config.enabledTools) {
      ctx.ui.notify(`Enabled actions: ${config.enabledTools.join(", ")}`);
    } else {
      ctx.ui.notify("All actions enabled: discover, start, collect");
    }

    // Show other config
    ctx.ui.notify(`Base URL: ${config.baseUrl || DEFAULT_BASE_URL}`);
    ctx.ui.notify(`Max results: ${config.maxResults || MAX_RESULT_CHARS} characters per collect call`);
  } catch (error) {
    ctx.ui.notify(`Error checking status: ${errorMessage(error)}`, "error");
  }
}
