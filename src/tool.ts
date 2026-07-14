import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { apifyExecute } from "./actions/index.ts";
import { KNOWN_ACTORS } from "./utils/constants.ts";

// Build the full tool description
const toolDescription = `
Universal Apify Actor integration. Access 20,000+ web scraping and automation Actors through three primitives: discover (search/schema), start (launch runs), collect (poll & fetch results).

WORKFLOW:
1. discover → search for an Actor (query) or inspect its schema (actorId)
2. discover → inspect the schema of the best match to understand input shape
3. start → launch the Actor run (returns immediately)
4. collect → poll for results; repeat until allDone=true and no pending runs

Slugs use tilde: username~actor-name (NEVER slash). Examples: apify~instagram-scraper, compass~crawler-google-places.

BATCHING: Most Actors accept arrays in their input. Batching inputs (e.g. multiple URLs in startUrls) into ONE run is far cheaper and faster than multiple single-input runs. Prefer one run with an array over N runs with scalar inputs.

KNOWN ACTORS:
${KNOWN_ACTORS}

DELEGATION: For large scrapes, call this tool from a sub-agent and return only summary/extracted fields, never the raw dataset. This protects the main agent's context window.
`.trim();

// Define the tool parameters schema
const toolParams = Type.Object({
  action: Type.Union([
    Type.Literal("discover"),
    Type.Literal("start"),
    Type.Literal("collect"),
  ], {
    description: "The action to perform. 'discover' searches the Store or fetches an Actor's input schema/README. 'start' launches an Actor run (returns immediately). 'collect' polls one or more runs and pulls dataset rows from finished ones."
  }),

  // discover-mode fields
  query: Type.Optional(Type.String({
    description: "Search query for finding Actors in the Store. Used with action='discover'."
  })),
  actorId: Type.Optional(Type.String({
    description: "Actor slug (e.g. 'apify~instagram-scraper') or ID. Used with action='discover' to fetch schema/README, or with action='start' to launch a run."
  })),

  // start-mode fields
  input: Type.Optional(Type.Record(Type.String(), Type.Any(), {
    description: "JSON input payload for the Actor run. Used with action='start'. Most Actors accept arrays (e.g. startUrls, usernames) for batching."
  })),
  label: Type.Optional(Type.String({
    description: "Opaque label carried through to collect results for correlation. Used with action='start'."
  })),

  // collect-mode fields
  runReferences: Type.Optional(Type.Array(Type.Object({
    runId: Type.String(),
    actorId: Type.String(),
    datasetId: Type.String(),
    label: Type.Optional(Type.String()),
  }), {
    description: "Array of run references to poll. Used with action='collect'. Pass the pending run references from a previous collect call until allDone is true."
  })),

  // shared
  maxResults: Type.Optional(Type.Number({
    description: "Max characters for dataset output. Default 50000."
  })),
}, { additionalProperties: false });

// Create the tool definition
export const apifyTool = defineTool({
  name: "apify",
  label: "Apify",
  description: toolDescription,
  parameters: toolParams,
  executionMode: "sequential",  // Tool calls execute one at a time
  execute: apifyExecute,
  promptSnippet: "Apify - Run web scraping and automation Actors",
  promptGuidelines: [
    "Always use the apify tool with the workflow: discover (search) → discover (schema) → start → collect (repeat until allDone)",
    "Actor slugs must use tilde (~) not slash (/). Example: apify~instagram-scraper",
    "Batch multiple inputs into one Actor run when possible (e.g. multiple URLs in startUrls array)",
    "When collecting results, repeat the collect action with pending run references until allDone is true",
    "For large scrapes, delegate to a sub-agent that returns only extracted fields, not raw datasets",
  ],
});