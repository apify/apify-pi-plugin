import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { apifyTool } from "./src/tool.ts";
import { apifyLoginCommand, apifyStatusCommand, apifyTestCommand } from "./src/commands/index.ts";
import { isEnabled, loadConfig } from "./src/utils/config.ts";
import { createClient } from "./src/utils/client.ts";

/**
 * Apify Pi Plugin - Universal Apify Actor integration for the Pi agent.
 * Exposes a single 'apify' tool with discover/start/collect primitives
 * that wraps every Actor in Apify Store.
 */
export default function (pi: ExtensionAPI) {
  // Register the universal apify tool only when a key is available and the
  // integration isn't explicitly disabled, so a keyless install registers nothing.
  let toolRegistered = false;
  const registerApifyTool = () => {
    if (!toolRegistered) {
      pi.registerTool(apifyTool);
      toolRegistered = true;
    }
  };
  if (isEnabled(loadConfig())) {
    registerApifyTool();
  }

  // Register the /apify command with subcommands
  pi.registerCommand("apify", {
    description: "Apify Actor integration: manage your API token and test the connection",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const subArgs = parts.slice(1).join(" ");

      switch (subcommand) {
        case "login":
          return apifyLoginCommand(ctx, registerApifyTool);
        case "status":
          return apifyStatusCommand(subArgs, ctx);
        case "test":
          return apifyTestCommand(subArgs, ctx);
        case "":
        case "help":
          ctx.ui.notify("Apify integration commands:");
          ctx.ui.notify("  /apify login: Set up your Apify API token");
          ctx.ui.notify("  /apify status: Check authentication and configuration");
          ctx.ui.notify("  /apify test: Test the connection to Apify");
          ctx.ui.notify("");
          ctx.ui.notify("To use Apify Actors in your prompts, use the 'apify' tool with actions:");
          ctx.ui.notify("  - discover: Search for Actors or get an Actor's input schema");
          ctx.ui.notify("  - start: Start an Actor run");
          ctx.ui.notify("  - collect: Check runs and fetch results");
          break;
        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}`);
          ctx.ui.notify("Usage: /apify login | status | test | help");
      }
    },
  });

  // Point out setup problems on session start, without any network calls
  pi.on("session_start", async (_event, ctx) => {
    const config = loadConfig();

    // If explicitly disabled, stay silent
    if (config.enabled === false) {
      return;
    }

    const clientResult = createClient(config);
    if (clientResult.ok) {
      return;
    }
    if (clientResult.error === "missing_credential") {
      ctx.ui.notify("Apify: not set up. Run /apify login to add your API token.");
    } else {
      ctx.ui.notify(`Apify: ${clientResult.message}`, "warning");
    }
  });
}
