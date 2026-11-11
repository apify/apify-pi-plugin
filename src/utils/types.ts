import type { ApifyAction } from "./config.ts";

// A started run, as returned by start and passed back into collect
export interface RunReference {
  runId: string;
  actorId: string;
  datasetId: string;
  label?: string;
}

// Tool parameters interface (mirrors the TypeBox schema in src/tool.ts)
export interface ApifyToolParams {
  action: ApifyAction;
  // discover-mode fields
  query?: string;
  actorId?: string;
  // start-mode fields
  input?: Record<string, unknown>;
  label?: string;
  // collect-mode fields
  runReferences?: RunReference[];
  // shared
  maxResults?: number;
}

// Tool details interfaces
export interface ErrorDetails {
  error: string;
}

export interface DiscoverDetails {
  mode: "search" | "schema";
  results?: unknown[];
  actor?: unknown;
  schema?: unknown;
  readme?: string;
}

export interface StartDetails extends RunReference {
  status: string;
}

export interface CollectDetails {
  completed: Array<RunReference & {
    status: string;
    itemCount: number;   // items returned (at most MAX_ITEMS_PER_DATASET)
    totalItems: number;  // items in the dataset
  }>;
  pending: Array<RunReference & {
    status: string;
    lastError?: string;  // set when polling failed and will be retried
  }>;
  errors: Array<RunReference & {
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

export type ApifyToolDetails = DiscoverDetails | StartDetails | CollectDetails | ErrorDetails;
