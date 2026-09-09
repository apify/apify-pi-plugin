import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../client/index.ts";
import { loadConfig, resolveApiKey } from "../config/index.ts";

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
