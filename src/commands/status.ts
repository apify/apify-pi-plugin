import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../utils/client.ts";
import { loadConfig, resolveApiKey } from "../utils/config.ts";
import { fingerprintKey } from "../security/index.ts";

/**
 * Handle /apify status command.
 * Show current configuration and authentication status.
 */
export async function apifyStatusCommand(_args: string, ctx: ExtensionContext): Promise<void> {
  try {
    const config = loadConfig();

    // Check if configured
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      ctx.ui.notify("❌ Apify not configured. Run /apify login to set up your API key.");
      ctx.ui.notify("You can also set the APIFY_API_KEY environment variable.");
      return;
    }

    // Test connectivity
    ctx.ui.notify("Checking Apify connection...");
    const client = createClient(config);

    if (!client) {
      ctx.ui.notify("Failed to create Apify client.");
      return;
    }

    const result = await testConnectivity(client);

    if (result.success) {
      ctx.ui.notify(`✅ Authenticated as ${result.userId} (${result.plan} plan)`);
      ctx.ui.notify(`Key fingerprint: ${fingerprintKey(apiKey)}`);
    } else {
      ctx.ui.notify(`⚠️ Authentication failed: ${result.error}`);
      ctx.ui.notify(`Key fingerprint: ${fingerprintKey(apiKey)}`);
    }

    // Show enabled status
    if (config.enabled === false) {
      ctx.ui.notify("⚠️ Apify integration is disabled in config");
    } else {
      ctx.ui.notify("✅ Apify integration is enabled");
    }

    // Show enabled tools
    if (config.enabledTools) {
      ctx.ui.notify(`Enabled actions: ${config.enabledTools.join(", ")}`);
    } else {
      ctx.ui.notify("All actions enabled: discover, start, collect");
    }

    // Show other config
    ctx.ui.notify(`Base URL: ${config.baseUrl || "https://api.apify.com"}`);
    ctx.ui.notify(`Max results: ${config.maxResults || 50000} chars`);
  } catch (error) {
    ctx.ui.notify(`Error checking status: ${error instanceof Error ? error.message : String(error)}`);
  }
}
