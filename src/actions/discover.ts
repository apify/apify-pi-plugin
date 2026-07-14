import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyToolParams, DiscoverDetails } from "../types/index.ts";
import { validateSlug } from "../utils/normalize.ts";

/**
 * Handle discover action (search or schema mode).
 */
export async function handleDiscover(
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