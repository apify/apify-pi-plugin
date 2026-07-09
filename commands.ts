import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "./client.js";
import { loadConfig, writeGlobalConfig, resolveApiKey } from "./config.js";
import { normalizeSecretInput, fingerprintKey } from "./normalize.js";

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

/**
 * Handle /apify test command.
 * Test connectivity and optionally run a simple actor.
 */
export async function apifyTestCommand(_args: string, ctx: ExtensionContext): Promise<void> {
  try {
    const config = loadConfig();

    // Check if configured
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      ctx.ui.notify("❌ Apify not configured. Run /apify login first.");
      return;
    }

    // Test basic connectivity
    ctx.ui.notify("Testing Apify connection...");
    const client = createClient(config);

    if (!client) {
      ctx.ui.notify("Failed to create Apify client.");
      return;
    }

    const result = await testConnectivity(client);

    if (!result.success) {
      ctx.ui.notify(`❌ Connection failed: ${result.error}`);
      return;
    }

    ctx.ui.notify(`✅ Connected as ${result.userId} (${result.plan} plan)`);

    // Optionally test a simple actor run
    ctx.ui.notify("\nTesting actor run with a minimal example...");
    try {
      // Use a simple, fast actor for testing
      const testActor = "apify~web-scraper";
      const testInput = {
        startUrls: [{ url: "https://example.com" }],
        maxRequestsPerCrawl: 1,
        maxRequestRetries: 0,
        maxCrawlDepth: 0,
        keepUrlFragments: false,
      };

      ctx.ui.notify(`Starting test run of ${testActor}...`);
      const run = await client.actor(testActor).start(testInput, { waitForFinish: 60 });  // Wait max 60 seconds

      if (run.status === "SUCCEEDED") {
        const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
        ctx.ui.notify(`✅ Test run succeeded! Got ${dataset.items?.length || 0} results.`);
        ctx.ui.notify(`Run ID: ${run.id}`);
        ctx.ui.notify(`Duration: ${run.stats?.durationMillis || 0}ms`);
      } else {
        ctx.ui.notify(`⚠️ Test run ended with status: ${run.status}`);
        if (run.statusMessage) {
          ctx.ui.notify(`Message: ${run.statusMessage}`);
        }
      }
    } catch (runError) {
      ctx.ui.notify(`⚠️ Test run failed: ${runError instanceof Error ? runError.message : String(runError)}`);
      ctx.ui.notify("Basic connectivity works, but actor execution may have issues.");
    }
  } catch (error) {
    ctx.ui.notify(`Error during test: ${error instanceof Error ? error.message : String(error)}`);
  }
}