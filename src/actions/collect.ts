import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyToolParams, CollectDetails } from "../types/index.ts";
import { wrapUntrustedContent } from "../utils/wrap.ts";
import { MAX_RESULT_CHARS } from "../utils/constants.ts";

// Maximum number of items per dataset to prevent context overflow
const MAX_ITEMS_PER_DATASET = 100;

/**
 * Handle collect action (poll runs and get datasets).
 */
export async function handleCollect(
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
        // Fetch dataset items with limit
        const dataset = await client.dataset(ref.datasetId).listItems({
          clean: true,
          limit: MAX_ITEMS_PER_DATASET  // Enforce 100 item limit
        });

        // Double-check and slice if API doesn't respect limit
        const items = dataset.items ? dataset.items.slice(0, MAX_ITEMS_PER_DATASET) : [];

        return {
          type: "completed" as const,
          data: {
            runId: ref.runId,
            actorId: ref.actorId,
            datasetId: ref.datasetId,
            label: ref.label,
            status: run.status,
            itemCount: items.length,
            items: items,
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
      const itemNote = run.itemCount >= MAX_ITEMS_PER_DATASET ? ` (limited to ${MAX_ITEMS_PER_DATASET})` : "";
      text += `- runId: ${run.runId} (${run.actorId})${labelText} — ${run.itemCount} items${itemNote} — see dataset below\n`;
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