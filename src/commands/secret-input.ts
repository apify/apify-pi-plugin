import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Input, truncateToWidth } from "@earendil-works/pi-tui";

/**
 * Ask for a secret without showing it on screen.
 * In the terminal UI the value is masked; other modes fall back to pi's plain input dialog.
 * @returns The entered value, or undefined if the user cancelled
 */
export async function promptSecret(ctx: ExtensionContext, title: string): Promise<string | undefined> {
  if (ctx.mode !== "tui") {
    // RPC clients render the dialog themselves and can mask it; other modes can't
    if (ctx.mode !== "rpc") {
      ctx.ui.notify("This mode can't hide input, so the key will be visible while you type.", "warning");
    }
    return ctx.ui.input(title, "Paste your API token");
  }

  const value = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    // Reuse pi's Input for editing and paste handling; only rendering is replaced
    const input = new Input();
    input.onSubmit = (submitted) => done(submitted);
    input.onEscape = () => done(null);

    return {
      get focused() {
        return input.focused;
      },
      set focused(focused: boolean) {
        input.focused = focused;
      },
      render(width: number): string[] {
        const length = input.getValue().length;
        const masked = length > 0
          ? `${"•".repeat(Math.min(length, 40))} (${length} characters)`
          : theme.fg("dim", "Paste your API token");
        return [
          theme.fg("accent", title),
          masked,
          theme.fg("dim", "Enter to confirm, Escape to cancel"),
        ].map((line) => truncateToWidth(line, width));
      },
      handleInput(data: string): void {
        input.handleInput(data);
        tui.requestRender();
      },
      invalidate(): void {
        input.invalidate();
      },
    };
  });

  return value ?? undefined;
}
