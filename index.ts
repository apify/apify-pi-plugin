import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { apifyTool } from "./tool.js";
import { apifyLoginCommand, apifyStatusCommand, apifyTestCommand } from "./commands.js";
import { loadConfig, resolveApiKey } from "./config.js";
import { createClient, testConnectivity } from "./client.js";
import { fingerprintKey } from "./normalize.js";

/**
 * Apify Pi Plugin - Universal Apify Actor integration for the Pi agent.
 * Exposes a single 'apify' tool with discover/start/collect primitives
 * that wraps all 20,000+ Actors on the Apify Store.
 */
export default function (pi: ExtensionAPI) {
  // Register the universal apify tool
  pi.registerTool(apifyTool);

  // Register the /apify command with subcommands
  pi.registerCommand("apify", {
    description: "Apify Actor integration - manage API key and test connectivity",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const subArgs = parts.slice(1).join(" ");

      switch (subcommand) {
        case "login":
          return apifyLoginCommand(ctx);
        case "status":
          return apifyStatusCommand(subArgs, ctx);
        case "test":
          return apifyTestCommand(subArgs, ctx);
        case "":
        case "help":
          ctx.ui.notify("Apify integration commands:");
          ctx.ui.notify("  /apify login  - Configure your Apify API key");
          ctx.ui.notify("  /apify status - Check authentication and configuration");
          ctx.ui.notify("  /apify test   - Test connectivity and run a simple Actor");
          ctx.ui.notify("");
          ctx.ui.notify("To use Apify Actors in your prompts, use the 'apify' tool with actions:");
          ctx.ui.notify("  - discover: Search for Actors or get an Actor's schema");
          ctx.ui.notify("  - start: Launch an Actor run");
          ctx.ui.notify("  - collect: Poll runs and fetch results");
          break;
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}`);
          ctx.ui.notify("Usage: /apify login | status | test | help");
      }
    },
  });

  // Status check on session start
  pi.on("session_start", async (_event, ctx) => {
    try {
      const config = loadConfig();

      // If explicitly disabled, stay silent
      if (config.enabled === false) {
        return;
      }

      // Check if API key is configured
      const apiKey = resolveApiKey(config);
      if (!apiKey) {
        ctx.ui.notify("Apify: not configured. Run /apify login to set up your API key.");
        return;
      }

      // Try to verify the key
      const client = createClient(config);
      if (!client) {
        ctx.ui.notify("Apify: failed to initialize client. Check your configuration.");
        return;
      }

      const result = await testConnectivity(client);
      if (result.success) {
        ctx.ui.notify(`Apify: authenticated as ${result.userId} (key ${fingerprintKey(apiKey)})`);
      } else {
        ctx.ui.notify("Apify: authentication failed. Run /apify login to reconfigure.");
      }
    } catch (error) {
      // Silently ignore errors on session start to avoid spamming
      console.error("Apify session_start error:", error);
    }
  });
}