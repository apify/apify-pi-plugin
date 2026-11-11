import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyClient } from "apify-client";
import type { ApifyToolParams, CollectDetails, ErrorDetails, RunReference } from "../utils/types.ts";
import type { ApifyConfig } from "../utils/config.ts";
import { wrapUntrustedContent } from "../security/index.ts";
import { MAX_ITEMS_PER_DATASET, MAX_RESULT_CHARS } from "../utils/constants.ts";
import { errorMessage } from "../utils/errors.ts";

// Terminal status set: SUCCEEDED | FAILED | ABORTED | TIMED-OUT
const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];

type RunOutcome =
  | { type: "completed"; data: CollectDetails["completed"][number]; items: unknown[] }
  | { type: "pending"; data: CollectDetails["pending"][number] }
  | { type: "error"; data: CollectDetails["errors"][number]; fromActor: boolean };

/**
 * A 4xx response (other than 429 rate limiting) won't succeed on retry.
 * Anything else (network errors, 5xx, 429) is treated as temporary.
 */
function isPermanentFailure(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 429;
}

/**
 * Poll one run and, if it succeeded, fetch up to MAX_ITEMS_PER_DATASET items.
 */
async function collectRun(client: ApifyClient, ref: RunReference): Promise<RunOutcome> {
  const base = { runId: ref.runId, actorId: ref.actorId, datasetId: ref.datasetId, label: ref.label };
  const failed = (error: unknown, status: string, context: string): RunOutcome =>
    isPermanentFailure(error)
      ? { type: "error", data: { ...base, status, error: `${context}${errorMessage(error)}` }, fromActor: false }
      : { type: "pending", data: { ...base, status, lastError: `${context}${errorMessage(error)}` } };

  let run;
  try {
    run = await client.run(ref.runId).get();
  } catch (error) {
    return failed(error, "UNKNOWN", "");
  }

  if (!run) {
    return { type: "error", data: { ...base, status: "UNKNOWN", error: "Run not found" }, fromActor: false };
  }

  if (run.status === "SUCCEEDED") {
    try {
      const page = await client.dataset(ref.datasetId).listItems({
        clean: true,
        limit: MAX_ITEMS_PER_DATASET,
      });
      // Double-check and slice if API doesn't respect limit
      const items = (page.items ?? []).slice(0, MAX_ITEMS_PER_DATASET);
      return {
        type: "completed",
        data: { ...base, status: run.status, itemCount: items.length, totalItems: Math.max(page.total ?? 0, items.length) },
        items,
      };
    } catch (error) {
      return failed(error, run.status, "Run succeeded, but fetching its dataset failed: ");
    }
  }

  if (TERMINAL_STATUSES.includes(run.status)) {
    return {
      type: "error",
      data: { ...base, status: run.status, error: run.statusMessage || `Run ${run.status.toLowerCase()}` },
      fromActor: Boolean(run.statusMessage),
    };
  }

  // READY, RUNNING, etc. -> pending
  return { type: "pending", data: { ...base, status: run.status } };
}

/**
 * Handle collect action (poll runs and get datasets).
 */
export async function handleCollect(
  client: ApifyClient,
  params: ApifyToolParams,
  config: ApifyConfig
): Promise<AgentToolResult<CollectDetails | ErrorDetails>> {
  const refs = params.runReferences;
  if (!refs || !Array.isArray(refs) || refs.length === 0) {
    return {
      content: [{ type: "text", text: "collect action requires 'runReferences' array parameter" }],
      details: { error: "missing_run_references" },
    };
  }

  // One character budget for the whole response. The agent can lower it, not raise it.
  const configLimit = config.maxResults ?? MAX_RESULT_CHARS;
  const budget = params.maxResults && params.maxResults > 0 ? Math.min(params.maxResults, configLimit) : configLimit;

  // Process all runs in parallel using Promise.allSettled
  const results = await Promise.allSettled(refs.map((ref) => collectRun(client, ref)));

  // Sort results into buckets
  const completed: CollectDetails["completed"] = [];
  const pending: CollectDetails["pending"] = [];
  const errors: CollectDetails["errors"] = [];
  const itemsByRun = new Map<string, unknown[]>();
  const actorErrors = new Set<string>();

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      // collectRun catches its own errors; treat anything that slips through as temporary
      const ref = refs[index];
      pending.push({ ...ref, status: "UNKNOWN", lastError: errorMessage(result.reason) });
      return;
    }
    const outcome = result.value;
    if (outcome.type === "completed") {
      completed.push(outcome.data);
      itemsByRun.set(outcome.data.runId, outcome.items);
    } else if (outcome.type === "pending") {
      pending.push(outcome.data);
    } else {
      errors.push(outcome.data);
      if (outcome.fromActor) actorErrors.add(outcome.data.runId);
    }
  });

  const allDone = pending.length === 0;

  // Build human-readable text
  let text = `Runs collected: ${completed.length} completed, ${pending.length} pending, ${errors.length} error${errors.length !== 1 ? "s" : ""}\n\n`;

  if (completed.length > 0) {
    text += "**Completed:**\n";
    for (const run of completed) {
      const labelText = run.label ? ` (${run.label})` : "";
      const countText = run.totalItems > run.itemCount
        ? `showing ${run.itemCount} of ${run.totalItems} items (limit ${MAX_ITEMS_PER_DATASET} per run)`
        : `${run.itemCount} items`;
      text += `- runId: ${run.runId} (${run.actorId})${labelText}: ${countText}\n`;
    }
    text += "\n";
  }

  if (pending.length > 0) {
    text += "**Pending:**\n";
    for (const run of pending) {
      const labelText = run.label ? ` (${run.label})` : "";
      const retryText = run.lastError ? ` (temporary error, will retry: ${run.lastError})` : "";
      text += `- runId: ${run.runId} (${run.actorId})${labelText}: ${run.status}${retryText}\n`;
    }
    text += "\n";
  }

  if (errors.length > 0) {
    text += "**Errors:**\n";
    for (const run of errors) {
      const labelText = run.label ? ` (${run.label})` : "";
      // Status messages are set by the Actor, so they're untrusted
      const errorText = actorErrors.has(run.runId) ? `\n${wrapUntrustedContent(run.error, run.actorId, 1_000)}` : ` ${run.error}`;
      text += `- runId: ${run.runId} (${run.actorId})${labelText}: ${run.status}:${errorText}\n`;
    }
    text += "\n";
  }

  // Add wrapped datasets for completed runs, splitting the budget between them
  const runsWithItems = completed.filter((run) => run.itemCount > 0);
  const perRunBudget = Math.floor(budget / Math.max(1, runsWithItems.length));
  for (const run of runsWithItems) {
    text += "\n" + wrapUntrustedContent(itemsByRun.get(run.runId), run.actorId, perRunBudget) + "\n";
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
  if (runsWithItems.length > 0) {
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
