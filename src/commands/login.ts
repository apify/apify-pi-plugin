import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createClient, testConnectivity } from "../utils/client.ts";
import { getGlobalConfigPath, readGlobalConfig, writeGlobalConfig } from "../utils/config.ts";
import { CONSOLE_INTEGRATIONS_URL } from "../utils/constants.ts";
import { errorMessage } from "../utils/errors.ts";
import { fingerprintKey } from "../security/index.ts";
import { promptSecret } from "./secret-input.ts";

/**
 * Handle /apify login command.
 * Asks for the API token (masked in the terminal UI), verifies it,
 * and with the user's consent saves it to the global config.
 * @param onSaved - Called after the key is saved, e.g. to register the apify tool
 */
export async function apifyLoginCommand(ctx: ExtensionContext, onSaved: () => void): Promise<void> {
  try {
    ctx.ui.notify(`Get your Apify API token at: ${CONSOLE_INTEGRATIONS_URL}`);

    const apiKey = await promptSecret(ctx, "Apify API token:");
    if (!apiKey || !apiKey.trim()) {
      ctx.ui.notify("No API token provided. Login cancelled.");
      return;
    }

    // Only the global config: project overrides must never be copied into it
    const globalConfig = readGlobalConfig();

    ctx.ui.notify("Validating API token...");
    const clientResult = createClient(globalConfig, apiKey);
    if (!clientResult.ok) {
      ctx.ui.notify(`❌ ${clientResult.message}`, "error");
      return;
    }

    const result = await testConnectivity(clientResult.client);
    if (!result.success) {
      ctx.ui.notify(`❌ Authentication failed: ${result.error}`, "error");
      ctx.ui.notify("Check your API token and try again.");
      return;
    }

    ctx.ui.notify(`✅ Authenticated as ${result.userId} (${result.plan} plan).`);

    const configPath = getGlobalConfigPath();
    const save = await ctx.ui.confirm("Save API token?", `Save the token to ${configPath}? Only your user account can read this file.`);
    if (!save) {
      ctx.ui.notify("Token not saved. To use it without saving, set the APIFY_API_KEY environment variable.");
      return;
    }

    writeGlobalConfig({ ...globalConfig, apiKey: clientResult.apiKey, enabled: true });
    onSaved();
    ctx.ui.notify(`Token saved to ${configPath} (fingerprint: ${fingerprintKey(clientResult.apiKey)})`);
  } catch (error) {
    ctx.ui.notify(`Error during login: ${errorMessage(error)}`, "error");
  }
}
