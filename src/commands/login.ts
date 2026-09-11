import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../utils/client.ts";
import { loadConfig, writeGlobalConfig } from "../utils/config.ts";
import { normalizeSecretInput, fingerprintKey } from "../security/index.ts";

/**
 * Handle /apify login command.
 * Interactive key configuration with masked input.
 */
export async function apifyLoginCommand(ctx: ExtensionContext): Promise<void> {
  try {
    // Prompt for API key
    ctx.ui.notify("Please enter your Apify API key:");
    ctx.ui.notify("You can find your API key at: https://console.apify.com/account/integrations");

    // Note: The ui.input method doesn't support password masking in Pi's current API
    // The user will need to paste their key in plain text
    const keyInput = await ctx.ui.input("Apify API key:", "paste your API key here");

    if (!keyInput || !keyInput.trim()) {
      ctx.ui.notify("No API key provided. Login cancelled.");
      return;
    }

    // Normalize the key
    const apiKey = normalizeSecretInput(keyInput);

    // Test the key
    ctx.ui.notify("Validating API key...");
    const client = createClient({ apiKey });

    if (!client) {
      ctx.ui.notify("Failed to create Apify client. Please check your API key.");
      return;
    }

    const result = await testConnectivity(client);

    if (result.success) {
      // Save the key to global config
      const config = loadConfig();
      config.apiKey = apiKey;
      config.enabled = true;  // Auto-enable
      writeGlobalConfig(config);

      ctx.ui.notify(`✅ Authenticated as ${result.userId} (${result.plan} plan).`);
      ctx.ui.notify(`Key saved to ~/.pi/agent/apify.json (fingerprint: ${fingerprintKey(apiKey)})`);
    } else {
      ctx.ui.notify(`❌ Authentication failed: ${result.error}`);
      ctx.ui.notify("Please check your API key and try again.");
    }
  } catch (error) {
    ctx.ui.notify(`Error during login: ${error instanceof Error ? error.message : String(error)}`);
  }
}
