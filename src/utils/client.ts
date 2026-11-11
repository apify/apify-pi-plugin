import { ApifyClient } from "apify-client";
import type { ApifyConfig } from "./config.ts";
import { resolveApiKey } from "./config.ts";
import { DEFAULT_BASE_URL } from "./constants.ts";
import { errorMessage } from "./errors.ts";
import { normalizeSecretInput, validateBaseUrl } from "../security/index.ts";

export type ClientErrorCode = "missing_credential" | "invalid_base_url";

export type ClientResult =
  | { ok: true; client: ApifyClient; apiKey: string }
  | { ok: false; error: ClientErrorCode; message: string };

/**
 * Create an ApifyClient instance with proper configuration and telemetry headers.
 * Never throws: a missing key or a disallowed baseUrl is returned as a structured error.
 * @param config - The Apify configuration
 * @param apiKey - Optional explicit API key (overrides config)
 */
export function createClient(config: ApifyConfig, apiKey?: string): ClientResult {
  const key = apiKey ? normalizeSecretInput(apiKey) : resolveApiKey(config);
  if (!key) {
    return {
      ok: false,
      error: "missing_credential",
      message: "No Apify API key configured. Run /apify login or set the APIFY_API_KEY environment variable.",
    };
  }

  // SSRF guard: the key is only ever sent to https://api.apify.com
  const baseUrlCheck = validateBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  if (!baseUrlCheck.ok) {
    return { ok: false, error: "invalid_base_url", message: baseUrlCheck.message };
  }

  const client = new ApifyClient({
    token: key,
    baseUrl: baseUrlCheck.baseUrl,
    // Add request interceptor for telemetry headers
    requestInterceptors: [
      (requestOptions: any) => {
        requestOptions.headers = {
          ...requestOptions.headers,
          "x-apify-integration-platform": "pi",
          "x-apify-integration-ai-tool": "true",
        };
        return requestOptions;
      },
    ],
  });

  return { ok: true, client, apiKey: key };
}

/**
 * Format a client error as the JSON payload the tool returns to the agent.
 */
export function formatClientError(result: { error: ClientErrorCode; message: string }): string {
  return JSON.stringify({
    error: result.error,
    message: result.message,
    docs: "https://docs.apify.com/api/v2",
  }, null, 2);
}

/**
 * Test connectivity with the Apify API using the cheapest authenticated endpoint.
 * @param client - The ApifyClient instance
 * @returns User info or error
 */
export async function testConnectivity(client: ApifyClient): Promise<{
  success: boolean;
  userId?: string;
  plan?: string;
  error?: string;
}> {
  try {
    const user = await client.user("me").get();
    return {
      success: true,
      userId: user?.username || user?.id || "unknown",
      plan: user?.plan?.id || "unknown",
    };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error),
    };
  }
}
