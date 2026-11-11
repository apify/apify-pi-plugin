import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../utils/client.ts";
import { loadConfig } from "../utils/config.ts";
import { errorMessage } from "../utils/errors.ts";

/**
 * Handle /apify test command.
 * Verify connectivity via the cheapest authenticated endpoint (users/me).
 * It doesn't start an Actor run, so it costs nothing.
 */
export async function apifyTestCommand(_args: string, ctx: ExtensionContext): Promise<void> {
  try {
    const clientResult = createClient(loadConfig());
    if (!clientResult.ok) {
      ctx.ui.notify(`❌ ${clientResult.message}`, "error");
      return;
    }

    ctx.ui.notify("Testing Apify connection...");
    const result = await testConnectivity(clientResult.client);

    if (!result.success) {
      ctx.ui.notify(`❌ Connection failed: ${result.error}`, "error");
      return;
    }

    ctx.ui.notify(`✅ Connected as ${result.userId} (${result.plan} plan)`);
  } catch (error) {
    ctx.ui.notify(`Error during test: ${errorMessage(error)}`, "error");
  }
}
