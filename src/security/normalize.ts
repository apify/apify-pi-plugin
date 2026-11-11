/**
 * Normalize secret input by removing dangerous whitespace and control characters.
 * Strips \r, \n, U+2028, U+2029 and surrounding whitespace.
 */
export function normalizeSecretInput(input: string): string {
  // Remove carriage return, newline, and Unicode line/paragraph separators
  return input
    .replace(/[\r\n\u2028\u2029]/g, "")
    .trim();
}

// Apify object IDs are 17 alphanumeric characters
const ACTOR_ID_PATTERN = /^[a-zA-Z0-9]{17}$/;

/**
 * Validate an Actor reference: either a slug (username~actor-name) or an Actor ID.
 * Slugs must use tilde (~), not slash (/).
 * @param actorRef - The Actor slug or ID to validate
 * @returns The valid reference, or throws an error if invalid
 */
export function validateActorRef(actorRef: string): string {
  if (!actorRef) {
    throw new Error("Actor slug or ID is required");
  }

  if (ACTOR_ID_PATTERN.test(actorRef)) {
    return actorRef;
  }

  // REJECT slash-based slugs entirely (per spec requirement)
  if (actorRef.includes("/")) {
    throw new Error(`Invalid Actor slug: "${actorRef}". Use a tilde (~), not a slash (/): username~actor-name`);
  }

  const parts = actorRef.split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid Actor slug: "${actorRef}". Use username~actor-name or an Actor ID.`);
  }

  return actorRef;
}

/**
 * Fingerprint an API key for display (show only first ~12 chars).
 * Never show the full key in logs or UI.
 */
export function fingerprintKey(key: string): string {
  if (!key) return "";
  const visibleChars = Math.min(12, Math.floor(key.length / 3));
  return `${key.slice(0, visibleChars)}...`;
}
