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

export type ApifyToolDetails = DiscoverDetails | StartDetails | CollectDetails;