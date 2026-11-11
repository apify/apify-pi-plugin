import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyClient } from "apify-client";
import type { ApifyToolParams, DiscoverDetails, ErrorDetails } from "../utils/types.ts";
import { validateActorRef, wrapUntrustedContent } from "../security/index.ts";
import { MAX_README_CHARS, MAX_SCHEMA_CHARS } from "../utils/constants.ts";
import { errorMessage } from "../utils/errors.ts";

/**
 * Handle discover action (search or schema mode).
 */
export async function handleDiscover(
  client: ApifyClient,
  params: ApifyToolParams
): Promise<AgentToolResult<DiscoverDetails | ErrorDetails>> {
  // Validate: need exactly one of query or actorId
  if (!params.query && !params.actorId) {
    return {
      content: [{ type: "text", text: "discover action requires either 'query' (to search) or 'actorId' (to get schema)" }],
      details: { error: "missing_query_or_actor_id" },
    };
  }

  if (params.query && params.actorId) {
    return {
      content: [{ type: "text", text: "discover action requires either 'query' OR 'actorId', not both" }],
      details: { error: "both_query_and_actor_id" },
    };
  }

  if (params.query) {
    return searchStore(client, params.query);
  }
  return describeActor(client, params.actorId!);
}

/**
 * Search mode: list matching Actors from Apify Store.
 */
async function searchStore(client: ApifyClient, query: string): Promise<AgentToolResult<DiscoverDetails | ErrorDetails>> {
  try {
    const results = await client.store().list({
      search: query,
      limit: 10,
      sortBy: "relevance",
    });

    let text = `## Search results for "${query}"\n\n`;

    if (!results.items || results.items.length === 0) {
      text += "No Actors found matching your query.\n\n";
    } else {
      // Titles and descriptions are written by Actor publishers, so they go inside the untrusted wrapper.
      // The slug is built from the username and Actor name.
      let listing = "";
      for (const item of results.items as any[]) {
        const slug = `${item.username}~${item.name}`;
        const description = item.description ? item.description.slice(0, 100) + (item.description.length > 100 ? "..." : "") : "No description";
        const pricing = item.currentPricingInfo?.pricingModel || "unknown";
        const runCount = item.stats?.totalRuns || 0;

        listing += `### ${item.title || item.name}\n`;
        listing += `- **Slug:** \`${slug}\`\n`;
        listing += `- **Runs:** ${runCount.toLocaleString()}\n`;
        listing += `- **Pricing:** ${pricing}\n`;
        listing += `- **Description:** ${description}\n\n`;
      }
      text += wrapUntrustedContent(listing.trimEnd(), "store") + "\n\n";
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
      content: [{ type: "text", text: `Search failed: ${errorMessage(error)}` }],
      details: { error: "search_failed" },
    };
  }
}

/**
 * Schema mode: the Actor's default build → input schema and README.
 */
async function describeActor(client: ApifyClient, actorRef: string): Promise<AgentToolResult<DiscoverDetails | ErrorDetails>> {
  try {
    const actorId = validateActorRef(actorRef);
    const actorClient = client.actor(actorId);

    const actor = await actorClient.get();
    if (!actor) {
      return {
        content: [{ type: "text", text: `Actor not found: ${actorId}` }],
        details: { error: "actor_not_found" },
      };
    }

    // The build that start() runs: the Actor's configured default build.
    // An Actor without a usable default build still gets its title and description shown.
    const build = await actorClient.defaultBuild()
      .then((buildClient) => buildClient.get())
      .catch(() => undefined);

    // Prefer actorDefinition; fall back to the deprecated top-level build fields
    const inputSchema = build?.actorDefinition?.input ?? parseJson(build?.inputSchema);
    const fullReadme = build?.actorDefinition?.readme ?? build?.readme ?? (actor as any).readmeSummary;
    const readme = fullReadme
      ? fullReadme.slice(0, MAX_README_CHARS) + (fullReadme.length > MAX_README_CHARS ? "\n\n[...README truncated]" : "")
      : undefined;

    // Everything below except the slug and the tip comes from the Actor publisher
    let about = `Title: ${actor.title || actor.name}\n`;
    about += `Description: ${actor.description || "No description"}`;

    let text = `## Actor: \`${actorId}\`\n\n`;
    text += wrapUntrustedContent(about, actorId, MAX_README_CHARS) + "\n\n";

    text += `### Input schema\n\n`;
    text += inputSchema
      ? wrapUntrustedContent(inputSchema, actorId, MAX_SCHEMA_CHARS)
      : "No input schema available for this Actor.";
    text += "\n\n";

    text += `### README\n\n`;
    text += readme ? wrapUntrustedContent(readme, actorId, MAX_README_CHARS + 100) : "No README available.";
    text += "\n\n";

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
      content: [{ type: "text", text: `Failed to get Actor info: ${errorMessage(error)}` }],
      details: { error: "actor_info_failed" },
    };
  }
}

function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
