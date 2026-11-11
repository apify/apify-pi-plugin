import { readFileSync } from "fs";

// Synced from apify/apify-plugins-internal (apify-ultimate-scraper's Actor index). Don't edit by hand.
const ACTOR_INDEX_URL = new URL("../../generated/actor-index.md", import.meta.url);

// A table row: | owner/actor-name | tier | best for |
const ROW_PATTERN = /^\|\s*([\w.-]+\/[\w.-]+)\s*\|[^|]*\|\s*([^|]*?)\s*\|/;

/**
 * Turn the Actor index markdown into the compact catalog used in the tool description:
 * one line per category, `CATEGORY: owner~actor (best for), ...`. Slugs use tilde, not slash.
 */
export function formatActorCatalog(markdown: string): string {
  const categories: Array<{ name: string; actors: string[] }> = [];

  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+)/.exec(line);
    if (heading) {
      categories.push({ name: heading[1].trim().toUpperCase(), actors: [] });
      continue;
    }
    const row = ROW_PATTERN.exec(line);
    if (row && categories.length > 0) {
      const slug = row[1].replace("/", "~");
      categories[categories.length - 1].actors.push(row[2] ? `${slug} (${row[2]})` : slug);
    }
  }

  return categories
    .filter((category) => category.actors.length > 0)
    .map((category) => `${category.name}: ${category.actors.join(", ")}`)
    .join("\n\n");
}

/**
 * Load the Actor catalog for the tool description.
 * Returns an empty string if the generated index is missing, so the plugin still loads.
 */
export function loadActorCatalog(): string {
  try {
    return formatActorCatalog(readFileSync(ACTOR_INDEX_URL, "utf-8"));
  } catch (error) {
    console.warn("Apify: couldn't load generated/actor-index.md; the tool description has no Actor catalog.", error);
    return "";
  }
}
