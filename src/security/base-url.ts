import { DEFAULT_BASE_URL } from "../utils/constants.ts";

export type BaseUrlCheck =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

/**
 * Validate a configured baseUrl before the API key is sent to it (SSRF / key exfiltration guard).
 * Only the exact origin https://api.apify.com is allowed: no other host, port, credentials or path.
 * A prefix check is not enough: "https://api.apify.com.evil.com" and
 * "https://api.apify.com@evil.com" both start with the allowed origin.
 */
export function validateBaseUrl(raw: string): BaseUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: `baseUrl is not a valid URL. Only ${DEFAULT_BASE_URL} is allowed.` };
  }

  const isApifyOrigin =
    url.protocol === "https:" &&
    url.hostname === "api.apify.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/";

  if (!isApifyOrigin) {
    return { ok: false, message: `baseUrl is not allowed. Only ${DEFAULT_BASE_URL} is allowed.` };
  }

  return { ok: true, baseUrl: DEFAULT_BASE_URL };
}
