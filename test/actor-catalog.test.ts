import { describe, expect, it } from "vitest";
import { formatActorCatalog, loadActorCatalog } from "../src/utils/actor-catalog.ts";

describe("formatActorCatalog", () => {
  it("turns the index tables into one tilde-slug line per category", () => {
    const markdown = [
      "<!-- generated -->",
      "## Instagram",
      "",
      "| Actor | Tier | Best for |",
      "|-------|------|----------|",
      "| apify/instagram-scraper | apify | all Instagram data |",
      "| apify/instagram-reel-scraper | apify | reels, transcripts |",
      "",
      "## Empty category",
      "",
      "## Google Maps",
      "| compass/crawler-google-places | apify | places, reviews |",
    ].join("\n");

    expect(formatActorCatalog(markdown)).toBe(
      "INSTAGRAM: apify~instagram-scraper (all Instagram data), apify~instagram-reel-scraper (reels, transcripts)\n\n" +
      "GOOGLE MAPS: compass~crawler-google-places (places, reviews)"
    );
  });
});

describe("loadActorCatalog", () => {
  it("loads the generated index", () => {
    const catalog = loadActorCatalog();
    expect(catalog).toContain("INSTAGRAM: apify~instagram-scraper");
    expect(catalog).not.toMatch(/\b[\w-]+\/[\w-]+-scraper\b/); // no slash slugs
  });
});
