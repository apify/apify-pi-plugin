import { EXTERNAL_CONTENT_START, EXTERNAL_CONTENT_END, MAX_RESULT_CHARS } from "./constants.ts";

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
 * Wrap dataset results in untrusted content markers.
 * This is the primary defense against prompt injection via scraped content.
 *
 * @param content - The dataset content to wrap
 * @param actorId - The actor ID for source attribution
 * @param maxChars - Maximum characters before truncation (default: MAX_RESULT_CHARS)
 * @returns Wrapped and potentially truncated content
 */
export function wrapUntrustedContent(
  content: any,
  actorId: string,
  maxChars: number = MAX_RESULT_CHARS
): string {
  // Serialize to JSON
  let serialized = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  // Truncate if needed
  let truncated = false;
  if (serialized.length > maxChars) {
    serialized = serialized.slice(0, maxChars);
    truncated = true;
  }

  // Sanitize to prevent marker collision
  const sanitized = sanitizeForMarkers(serialized);

  // Build wrapped content
  let wrapped = `${EXTERNAL_CONTENT_START}\n`;
  wrapped += `Source: apify:${actorId}\n`;
  wrapped += `---CONTENT---\n`;
  wrapped += sanitized;
  if (truncated) {
    wrapped += `\n\n[...truncated]`;
  }
  wrapped += `\n---END-CONTENT---\n`;
  wrapped += EXTERNAL_CONTENT_END;

  return wrapped;
}

/**
 * Calculate if content will be truncated.
 * Useful for pre-flight checks.
 */
export function willBeTruncated(content: any, maxChars: number = MAX_RESULT_CHARS): boolean {
  const serialized = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return serialized.length > maxChars;
}