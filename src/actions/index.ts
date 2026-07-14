import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ApifyToolParams, ApifyToolDetails, DiscoverDetails } from "../types/index.ts";
import { createClient } from "../utils/client.ts";
import { loadConfig, resolveApiKey } from "../utils/config.ts";
import { handleDiscover } from "./discover.ts";
import { handleStart } from "./start.ts";
import { handleCollect } from "./collect.ts";

/**
 * Main execute function for the apify tool.
 */
export async function apifyExecute(
  _toolCallId: string,
  params: ApifyToolParams,
  _signal: AbortSignal | undefined,
  _onUpdate: AgentToolUpdateCallback<ApifyToolDetails> | undefined,
  ctx: ExtensionContext
): Promise<AgentToolResult<ApifyToolDetails>> {
  // Load config
  const config = loadConfig();

  // Check if enabled
  if (config.enabled === false) {
    return {
      content: [{ type: "text", text: "Apify integration is disabled. Enable it in config or run /apify login." }],
      details: { mode: "search" } as DiscoverDetails,
    };
  }

  // Check enabledTools
  if (config.enabledTools && !config.enabledTools.includes(params.action)) {
    return {
      content: [{ type: "text", text: `Action "${params.action}" is not enabled. Enabled actions: ${config.enabledTools.join(", ")}` }],
      details: { mode: "search" } as DiscoverDetails,
    };
  }

  // Resolve API key
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "missing_credential",
          message: "No Apify API key configured. Run /apify login or set APIFY_API_KEY env var.",
          docs: "https://docs.apify.com/api-reference/v2"
        }, null, 2)
      }],
      details: { mode: "search" } as DiscoverDetails,
    };
  }

  // Create client
  const client = createClient(config, apiKey);
  if (!client) {
    return {
      content: [{ type: "text", text: "Failed to create Apify client" }],
      details: { mode: "search" } as DiscoverDetails,
    };
  }

  // Route to appropriate handler
  switch (params.action) {
    case "discover":
      return handleDiscover(client, params, config);
    case "start":
      return handleStart(client, params, config);
    case "collect":
      return handleCollect(client, params, config);
    default:
      return {
        content: [{ type: "text", text: `Unknown action: ${params.action}` }],
        details: { mode: "search" } as DiscoverDetails,
      };
  }
}