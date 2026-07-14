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

/**
 * Validate and normalize actor slug format.
 * Ensures slug uses tilde (~) not slash (/).
 * @param slug - The actor slug to validate
 * @returns Valid slug or throws error if invalid
 */
export function validateSlug(slug: string): string {
  if (!slug) {
    throw new Error("Actor slug is required");
  }

  // REJECT slash-based slugs entirely (per spec requirement)
  if (slug.includes("/")) {
    throw new Error(`Invalid actor slug format: "${slug}". Slugs must use tilde (~) not slash (/). Use format: username~actor-name`);
  }

  // Validate format: username~actor-name
  if (!slug.includes("~")) {
    throw new Error(`Invalid actor slug format: "${slug}". Use format: username~actor-name (with tilde, not slash)`);
  }

  const parts = slug.split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid actor slug format: "${slug}". Use format: username~actor-name`);
  }

  return slug;
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