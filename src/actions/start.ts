import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ApifyToolParams, StartDetails } from "../types/index.ts";
import { validateSlug } from "../utils/normalize.ts";

/**
 * Handle start action (launch actor run).
 */
export async function handleStart(
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