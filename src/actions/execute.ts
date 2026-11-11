import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ApifyToolParams, ApifyToolDetails } from "../utils/types.ts";
import { createClient, formatClientError } from "../utils/client.ts";
import { loadConfig } from "../utils/config.ts";
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
  _ctx: ExtensionContext
): Promise<AgentToolResult<ApifyToolDetails>> {
  // Load config
  const config = loadConfig();

  // Check if enabled (the config may have changed since the tool was registered)
  if (config.enabled === false) {
    return {
      content: [{ type: "text", text: "Apify integration is disabled. Enable it in config or run /apify login." }],
      details: { error: "disabled" },
    };
  }

  // Check enabledTools
  if (config.enabledTools && !config.enabledTools.includes(params.action)) {
    return {
      content: [{ type: "text", text: `Action "${params.action}" is not enabled. Enabled actions: ${config.enabledTools.join(", ")}` }],
      details: { error: "action_disabled" },
    };
  }

  // Create client (missing key or disallowed baseUrl come back as structured errors)
  const clientResult = createClient(config);
  if (!clientResult.ok) {
    return {
      content: [{ type: "text", text: formatClientError(clientResult) }],
      details: { error: clientResult.error },
    };
  }
  const { client } = clientResult;

  // Route to appropriate handler
  switch (params.action) {
    case "discover":
      return handleDiscover(client, params);
    case "start":
      return handleStart(client, params);
    case "collect":
      return handleCollect(client, params, config);
    default:
      return {
        content: [{ type: "text", text: `Unknown action: ${params.action}` }],
        details: { error: "unknown_action" },
      };
  }
}
