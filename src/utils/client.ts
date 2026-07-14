import { ApifyClient } from "apify-client";
import type { ApifyConfig } from "./config.ts";
import { normalizeSecretInput } from "./normalize.ts";
import { resolveApiKey } from "./config.ts";

/**
 * Create an ApifyClient instance with proper configuration and telemetry headers.
 * @param config - The Apify configuration
 * @param apiKey - Optional explicit API key (overrides config)
 * @returns Configured ApifyClient or undefined if no key available
 */
export function createClient(config: ApifyConfig, apiKey?: string): ApifyClient | undefined {
  // Resolve the API key
  const key = apiKey || resolveApiKey(config);
  if (!key) {
    return undefined;
  }

  // Normalize the key (strip dangerous whitespace)
  const normalizedKey = normalizeSecretInput(key);

  // Validate baseUrl for SSRF protection
  const baseUrl = config.baseUrl || "https://api.apify.com";
  if (!baseUrl.startsWith("https://api.apify.com")) {
    throw new Error("baseUrl must start with https://api.apify.com");
  }

  // Create client with telemetry headers via request interceptor
  const client = new ApifyClient({
    token: normalizedKey,
    baseUrl,
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

  return client;
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}