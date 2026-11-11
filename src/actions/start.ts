import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyClient } from "apify-client";
import type { ApifyToolParams, ErrorDetails, StartDetails } from "../utils/types.ts";
import { validateActorRef } from "../security/index.ts";
import { errorMessage } from "../utils/errors.ts";

/**
 * Handle start action (launch Actor run).
 */
export async function handleStart(
  client: ApifyClient,
  params: ApifyToolParams
): Promise<AgentToolResult<StartDetails | ErrorDetails>> {
  // Validate required params
  if (!params.actorId) {
    return {
      content: [{ type: "text", text: "start action requires 'actorId' parameter" }],
      details: { error: "missing_actor_id" },
    };
  }

  if (!params.input || typeof params.input !== "object") {
    return {
      content: [{ type: "text", text: "start action requires 'input' parameter (JSON object)" }],
      details: { error: "missing_input" },
    };
  }

  try {
    const actorId = validateActorRef(params.actorId);

    // Start the Actor run (no waitForFinish - return immediately)
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
    return {
      content: [{ type: "text", text: `Failed to start Actor run: ${errorMessage(error)}` }],
      details: { error: "start_failed" },
    };
  }
}
