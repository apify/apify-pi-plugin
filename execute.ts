import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient } from "./client.js";
import { loadConfig, resolveApiKey } from "./config.js";
import { validateSlug, normalizeSecretInput } from "./normalize.js";
import { wrapUntrustedContent } from "./wrap.js";
import { MAX_RESULT_CHARS } from "./constants.js";

// Tool parameters interface
export interface ApifyToolParams {
  action: "discover" | "start" | "collect";
  // discover-mode fields
  query?: string;
  actorId?: string;
  // start-mode fields
  input?: Record<string, any>;
  label?: string;
  // collect-mode fields
  runReferences?: Array<{
    runId: string;
    actorId: string;
    datasetId: string;
    label?: string;
  }>;
  // shared
  maxResults?: number;
}

// Tool details interfaces
export interface DiscoverDetails {
  mode: "search" | "schema";
  results?: any[];
  actor?: any;
  schema?: any;
  readme?: string;
}

export interface StartDetails {
  runId: string;
  actorId: string;
  datasetId: string;
  label?: string;
  status: string;
}

export interface CollectDetails {
  completed: Array<{
    runId: string;
    actorId: string;
    datasetId: string;
    label?: string;
    status: string;
    itemCount: number;
    items: any[];
  }>;
  pending: Array<{
    runId: string;
    actorId: string;
    datasetId: string;
    label?: string;
    status: string;
  }>;
  errors: Array<{
    runId: string;
    actorId: string;
    datasetId: string;
    label?: string;
    status: string;
    error: string;
  }>;
  allDone: boolean;
  externalContent?: {
    untrusted: boolean;
    source: string;
    wrapped: boolean;
  };
}

type ApifyToolDetails = DiscoverDetails | StartDetails | CollectDetails;

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

/**
 * Handle discover action (search or schema mode).
 */
async function handleDiscover(
  client: any, // ApifyClient
  params: ApifyToolParams,
  config: any // ApifyConfig
): Promise<AgentToolResult<DiscoverDetails>> {
  // Validate: need exactly one of query or actorId
  if (!params.query && !params.actorId) {
    return {
      content: [{ type: "text", text: "discover action requires either 'query' (to search) or 'actorId' (to get schema)" }],
      details: { mode: "search" },
    };
  }

  if (params.query && params.actorId) {
    return {
      content: [{ type: "text", text: "discover action requires either 'query' OR 'actorId', not both" }],
      details: { mode: "search" },
    };
  }

  // Search mode
  if (params.query) {
    try {
      const results = await client.store().list({
        search: params.query,
        limit: 10,
        sortBy: "relevance",
      });

      // Format as compact Markdown list
      let text = `## Search results for "${params.query}"\n\n`;

      if (!results.items || results.items.length === 0) {
        text += "No actors found matching your query.\n\n";
      } else {
        for (const item of results.items) {
          const slug = `${item.username}~${item.name}`;
          const description = item.description ? item.description.slice(0, 100) + (item.description.length > 100 ? "..." : "") : "No description";
          const pricing = item.pricingModel || "unknown";
          const runCount = item.stats?.totalRuns || 0;

          text += `### ${item.title || item.name}\n`;
          text += `- **Slug:** \`${slug}\`\n`;
          text += `- **Runs:** ${runCount.toLocaleString()}\n`;
          text += `- **Pricing:** ${pricing}\n`;
          text += `- **Description:** ${description}\n\n`;
        }
      }

      text += `**Tip:** To inspect an Actor's input schema and README, call apify with action="discover" and actorId="username~actor-name".`;

      return {
        content: [{ type: "text", text }],
        details: {
          mode: "search",
          results: results.items,
        },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Search failed: ${error instanceof Error ? error.message : String(error)}` }],
        details: { mode: "search" },
      };
    }
  }

  // Schema mode
  if (params.actorId) {
    try {
      // Validate and normalize slug
      const actorId = validateSlug(params.actorId);

      // Get actor info
      const actor = await client.actor(actorId).get();
      if (!actor) {
        return {
          content: [{ type: "text", text: `Actor not found: ${actorId}` }],
          details: { mode: "schema" },
        };
      }

      // Get default build
      const builds = await client.actor(actorId).builds().list({ limit: 1 });
      const defaultBuild = builds?.items?.[0];

      // Extract input schema
      let inputSchema = null;
      if (defaultBuild?.meta?.inputSchema) {
        inputSchema = defaultBuild.meta.inputSchema;
      } else if (defaultBuild?.inputSchema) {
        inputSchema = defaultBuild.inputSchema;
      }

      // Get README (clipped to ~3000 chars)
      const readme = actor.readme ? actor.readme.slice(0, 3000) + (actor.readme.length > 3000 ? "\n\n[...README truncated]" : "") : "No README available";

      // Format response
      let text = `## Actor: ${actor.title || actor.name}\n\n`;
      text += `**Slug:** \`${actorId}\`\n`;
      text += `**Description:** ${actor.description || "No description"}\n\n`;

      if (inputSchema) {
        text += `### Input Schema\n\n`;
        // Format schema as compact JSON summary
        const schemaProps = inputSchema.properties || {};
        const required = inputSchema.required || [];
        text += "```json\n";
        text += JSON.stringify({
          title: inputSchema.title,
          type: inputSchema.type,
          properties: Object.keys(schemaProps).reduce((acc, key) => {
            acc[key] = {
              type: schemaProps[key].type,
              description: schemaProps[key].description?.slice(0, 100),
              required: required.includes(key),
            };
            return acc;
          }, {} as any),
        }, null, 2);
        text += "\n```\n\n";
      } else {
        text += "### Input Schema\n\nNo schema available for this actor.\n\n";
      }

      text += `### README\n\n${readme}\n\n`;

      text += `**Tip:** To run this Actor, call apify with action="start", actorId="${actorId}" and input={...}.`;

      return {
        content: [{ type: "text", text }],
        details: {
          mode: "schema",
          actor,
          schema: inputSchema,
          readme,
        },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to get actor info: ${error instanceof Error ? error.message : String(error)}` }],
        details: { mode: "schema" },
      };
    }
  }

  // Shouldn't reach here
  return {
    content: [{ type: "text", text: "Invalid discover parameters" }],
    details: { mode: "search" },
  };
}

/**
 * Handle start action (launch actor run).
 */
async function handleStart(
  client: any, // ApifyClient
  params: ApifyToolParams,
  config: any // ApifyConfig
): Promise<AgentToolResult<StartDetails>> {
  // Validate required params
  if (!params.actorId) {
    return {
      content: [{ type: "text", text: "start action requires 'actorId' parameter" }],
      details: {} as StartDetails,
    };
  }

  if (!params.input || typeof params.input !== "object") {
    return {
      content: [{ type: "text", text: "start action requires 'input' parameter (JSON object)" }],
      details: {} as StartDetails,
    };
  }

  try {
    // Validate and normalize slug
    const actorId = validateSlug(params.actorId);

    // Start the actor run (no waitForFinish - return immediately)
    const run = await client.actor(actorId).start(params.input);

    const details: StartDetails = {
      runId: run.id,
      actorId,
      datasetId: run.defaultDatasetId,
      label: params.label,
      status: run.status,
    };

    const labelText = params.label ? ` (label: ${params.label})` : "";
    const text = `Run started: ${actorId}${labelText}\n- Run ID: ${run.id}\n- Dataset ID: ${run.defaultDatasetId}\n- Status: ${run.status}`;

    return {
      content: [{ type: "text", text }],
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Failed to start actor run: ${errorMessage}` }],
      details: {} as StartDetails,
    };
  }
}

/**
 * Handle collect action (poll runs and get datasets).
 */
async function handleCollect(
  client: any, // ApifyClient
  params: ApifyToolParams,
  config: any // ApifyConfig
): Promise<AgentToolResult<CollectDetails>> {
  // Validate required params
  if (!params.runReferences || !Array.isArray(params.runReferences) || params.runReferences.length === 0) {
    return {
      content: [{ type: "text", text: "collect action requires 'runReferences' array parameter" }],
      details: {
        completed: [],
        pending: [],
        errors: [],
        allDone: true,
      },
    };
  }

  const maxResults = params.maxResults || config.maxResults || MAX_RESULT_CHARS;

  // Process all runs in parallel using Promise.allSettled
  const promises = params.runReferences.map(async (ref) => {
    try {
      // Get run status
      const run = await client.run(ref.runId).get();

      // Terminal status set: SUCCEEDED | FAILED | ABORTED | TIMED-OUT
      const terminalStatuses = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

      if (run.status === "SUCCEEDED") {
        // Fetch dataset items
        const dataset = await client.dataset(ref.datasetId).listItems({ clean: true });
        return {
          type: "completed" as const,
          data: {
            runId: ref.runId,
            actorId: ref.actorId,
            datasetId: ref.datasetId,
            label: ref.label,
            status: run.status,
            itemCount: dataset.items?.length || 0,
            items: dataset.items || [],
          },
        };
      } else if (terminalStatuses.includes(run.status)) {
        // Other terminal states go to errors
        return {
          type: "error" as const,
          data: {
            runId: ref.runId,
            actorId: ref.actorId,
            datasetId: ref.datasetId,
            label: ref.label,
            status: run.status,
            error: run.statusMessage || `Run ${run.status.toLowerCase()}`,
          },
        };
      } else {
        // READY, RUNNING, etc. -> pending
        return {
          type: "pending" as const,
          data: {
            runId: ref.runId,
            actorId: ref.actorId,
            datasetId: ref.datasetId,
            label: ref.label,
            status: run.status,
          },
        };
      }
    } catch (error) {
      // Network or API errors
      return {
        type: "error" as const,
        data: {
          runId: ref.runId,
          actorId: ref.actorId,
          datasetId: ref.datasetId,
          label: ref.label,
          status: "UNKNOWN",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  const results = await Promise.allSettled(promises);

  // Sort results into buckets
  const completed: CollectDetails["completed"] = [];
  const pending: CollectDetails["pending"] = [];
  const errors: CollectDetails["errors"] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { type, data } = result.value;
      if (type === "completed") {
        completed.push(data);
      } else if (type === "pending") {
        pending.push(data);
      } else if (type === "error") {
        errors.push(data);
      }
    } else {
      // Promise rejection (shouldn't happen with our try-catch, but handle anyway)
      const ref = params.runReferences[results.indexOf(result)];
      errors.push({
        runId: ref.runId,
        actorId: ref.actorId,
        datasetId: ref.datasetId,
        label: ref.label,
        status: "UNKNOWN",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  const allDone = pending.length === 0;

  // Build human-readable text
  let text = `Runs collected: ${completed.length} completed, ${pending.length} pending, ${errors.length} error${errors.length !== 1 ? "s" : ""}\n\n`;

  if (completed.length > 0) {
    text += "**Completed:**\n";
    for (const run of completed) {
      const labelText = run.label ? ` (${run.label})` : "";
      text += `- runId: ${run.runId} (${run.actorId})${labelText} — ${run.itemCount} items — see dataset below\n`;
    }
    text += "\n";
  }

  if (pending.length > 0) {
    text += "**Pending:**\n";
    for (const run of pending) {
      const labelText = run.label ? ` (${run.label})` : "";
      text += `- runId: ${run.runId} (${run.actorId})${labelText} — ${run.status}\n`;
    }
    text += "\n";
  }

  if (errors.length > 0) {
    text += "**Errors:**\n";
    for (const run of errors) {
      const labelText = run.label ? ` (${run.label})` : "";
      text += `- runId: ${run.runId} (${run.actorId})${labelText} — ${run.status}: ${run.error}\n`;
    }
    text += "\n";
  }

  // Add wrapped datasets for completed runs
  for (const run of completed) {
    if (run.items.length > 0) {
      text += "\n" + wrapUntrustedContent(run.items, run.actorId, maxResults) + "\n";
    }
  }

  if (!allDone) {
    text += "\n**Note:** Some runs are still pending. Call collect again with the pending run references to check their status.";
  }

  const details: CollectDetails = {
    completed,
    pending,
    errors,
    allDone,
  };

  // Set externalContent flag if we have completed runs with data
  if (completed.some(r => r.itemCount > 0)) {
    details.externalContent = {
      untrusted: true,
      source: "apify",
      wrapped: true,
    };
  }

  return {
    content: [{ type: "text", text }],
    details,
  };
}