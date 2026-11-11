import { EXTERNAL_CONTENT_START, EXTERNAL_CONTENT_END, MAX_RESULT_CHARS } from "../utils/constants.ts";

/**
 * Sanitize content to prevent marker collision.
 * Replaces any occurrence of the wrapping markers with escaped equivalents.
 */
function sanitizeForMarkers(content: string): string {
  return content
    .replace(new RegExp(EXTERNAL_CONTENT_START, "g"), "[ESCAPED:EXTERNAL_UNTRUSTED_CONTENT]")
    .replace(new RegExp(EXTERNAL_CONTENT_END, "g"), "[ESCAPED:END_EXTERNAL_UNTRUSTED_CONTENT]");
}

/**
 * Wrap third-party content (dataset rows, Actor READMEs, schemas, Store listings, run messages)
 * in untrusted content markers. This is the primary defense against prompt injection.
 *
 * @param content - The content to wrap
 * @param source - Where the content came from, e.g. the Actor slug
 * @param maxChars - Maximum characters before truncation (default: MAX_RESULT_CHARS)
 * @returns Wrapped and potentially truncated content
 */
export function wrapUntrustedContent(
  content: unknown,
  source: string,
  maxChars: number = MAX_RESULT_CHARS
): string {
  // Serialize to JSON
  let serialized = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  // Truncate if needed
  let truncated = false;
  if (serialized.length > maxChars) {
    serialized = serialized.slice(0, Math.max(0, maxChars));
    truncated = true;
  }

  // Sanitize to prevent marker collision
  const sanitized = sanitizeForMarkers(serialized);

  // Build wrapped content
  let wrapped = `${EXTERNAL_CONTENT_START}\n`;
  wrapped += `Source: apify:${source}\n`;
  wrapped += `---CONTENT---\n`;
  wrapped += sanitized;
  if (truncated) {
    wrapped += `\n\n[...truncated]`;
  }
  wrapped += `\n---END-CONTENT---\n`;
  wrapped += EXTERNAL_CONTENT_END;

  return wrapped;
}
