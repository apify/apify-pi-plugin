---
name: integrations-apify-plugin-design
description: Design guide for building Apify integration plugins that expose Apify Actors to an agent/host platform. Use when designing, building, or reviewing a new Apify integration plugin — covers the single universal `apify` tool shape, the discover/start/collect primitives, the two-phase async (start/collect) pattern, batching, external-content wrapping against prompt injection, secret normalization, base-URL allowlisting, the config surface, and the setup/status CLI. Triggers: "new Apify integration", "Apify plugin", "wrap Apify Actors", "agent tool for Apify", "integration plugin design".
---

# Apify integration plugin design

The integrations team builds Apify integration plugins for many different agent/host platforms
(OpenClaw, and more to come). This guide is the **shared playbook**: the patterns every Apify plugin
should follow so they stay small, safe, and consistent regardless of the host runtime.

The host platform is a generic consumer. Its only job is to call one function — `apify` — and respect
a couple of safety contracts. Everything below is about the **Apify side**: Actors, runs, datasets,
the Store, and the conventions a plugin builds on top of them.

For the full, concrete implementation these principles were extracted from, read the worked example:
[reference/openclaw-apify-plugin.md](reference/openclaw-apify-plugin.md).

---

## The core idea

There are 20,000+ Actors on the Apify Store. **Do not** register one tool per use case (one for
Instagram, one for Google Maps, …) — it is unmaintainable and blows up the agent's tool catalog.
Instead, treat Apify as a **single universal capability** — "run any Actor and bring me the results" —
exposed as one tool with three primitive actions:

| Action     | What it does on Apify                                                        |
|------------|------------------------------------------------------------------------------|
| `discover` | Search the Store, **or** fetch an Actor's input schema + README.             |
| `start`    | Launch an Actor run with a JSON input payload (returns immediately).         |
| `collect`  | Poll one or more runs; pull dataset rows from the ones that have finished.   |

The platform itself is the abstraction — every Actor takes JSON input, runs async, and writes rows to
a default dataset. The plugin just exposes those primitives plus a few safety properties. That is why
a few hundred lines cover all 20k Actors.

---
## Credential resolution

Credentials follow a fixed resolution order:

1. The configured secret (e.g. `apiKey` in plugin config).
2. A documented environment variable fallback (e.g. `APIFY_API_KEY`).
3. If neither is set, return a structured error payload — **do not** throw.

A missing credential is an expected runtime state, not a crash. The Apify API key should ideally be
shared with sibling integration tools (e.g. the same key is used by the web search provider
integration).

---
## Design principles

Each principle is stated generically with its rationale. Apply them to every new plugin.

1. **One universal tool, not one-per-use-case.** Map the whole Store onto `discover` / `start` /
   `collect`. The agent composes everything from those three.

2. **Two-phase async (`start` / `collect`), never a blocking `runActor`.** `start` returns
   *immediately* with a run reference `{ runId, actorId, datasetId, label }`. The agent is then free
   to start more runs, talk to the user, or do other work. It calls `collect` later to harvest data.
   A synchronous run would freeze the agent's turn for the full scrape duration (often minutes).

3. **The agent owns the polling loop; `allDone` is the loop condition.** Do *not* poll inside the
   plugin — long polls re-create the blocking problem. `collect` returns
   `{ allDone, completed[], pending[], errors[] }`; while `allDone` is `false`, the agent re-calls
   `collect` with the still-`pending` run references at a cadence it chooses.

4. **Fixed terminal-status set.** `SUCCEEDED | FAILED | ABORTED | TIMED-OUT`. Anything else
   (`READY`, `RUNNING`, …) → `pending`. Only `SUCCEEDED` fetches the dataset; every other terminal
   status → `errors` so the agent can retry, surface, or give up.

5. **`discover` is deliberately overloaded** — it is the agent's "I don't know yet" verb covering two
   read-only lookups that chain naturally:
   - **search mode** (`query`) → `client.store().list({ search, limit, sortBy: "relevance" })`,
     formatted as a compact Markdown list (title, slug, run count, pricing, clipped description).
   - **schema mode** (`actorId`) → the Actor's default build → `actorDefinition.input` (fall back to
     the deprecated `build.inputSchema`), README clipped to ~3000 chars, plus name/title.
   Both modes end with a `tip:` string naming the **exact next call** with the slug pre-formatted.

6. **Slug format: `username~actor-name` (tilde, not slash).** Enforce it everywhere the plugin
   constructs or accepts a slug. Models hallucinate slashes — the tilde avoids URL-path ambiguity.

7. **`start` trusts the Apify API for input validation.** Validate only "is `actorId` a string and
   `input` an object." Re-implementing per-Actor schema validation duplicates the schema and rots the
   moment an Actor changes. Let Apify return the structured error.

8. **`label` is an opaque passthrough.** The plugin never reads it; it just carries through to
   `collect`'s response so the agent can correlate parallel runs without remembering which `runId`
   was which.

9. **Batch into one run wherever the Actor supports it.** Most Actors accept arrays
   (`startUrls`, `queries`, `usernames`, …). One run with 50 inputs is far cheaper and faster than 50
   single-input runs (container starts once, per-run overhead paid once, one dataset to collect).
   This is enforced through the **tool description**, not code — the plugin can't know what's
   batchable.

10. **`collect` uses `Promise.allSettled`, not `Promise.all`.** Fire the whole batch in parallel; one
    failed run must not kill the others. Each run resolves independently into one of three buckets:
    `completed` / `pending` / `errors`.

11. **Defend the agent's context window — twice.** Datasets can be enormous.
    - Truncate the serialized rows to a hard cap (e.g. `MAX_RESULT_CHARS = 50_000`) with a
      `[…truncated]` marker.
    - **Wrap external content** between untrusted-content markers
      (`<<<EXTERNAL_UNTRUSTED_CONTENT>>> … <<<END_…>>>`) with a `Source: apify:<actorId>` header, and
      sanitize the body for marker collisions *before* wrapping so scraped text can't escape.
    Flag the response `externalContent: { untrusted: true, source: "apify", wrapped: true }`. **This
    is the single most important defense — it stops prompt injection via scraped content.**

12. **The tool description is the primary contract** — it's what the model actually reads when
    deciding how to call `apify`. It must carry: (a) the workflow script
    (`discover → discover → start → collect`), (b) the slug format, (c) the batching guidance,
    (d) a curated **flat comma-separated catalog** of well-known Actors (Instagram, Google Maps, etc.)
    so the model can skip a `discover` call, and (e) sub-agent delegation — call `apify` from a
    sub-agent that returns only the extracted fields, never the raw dataset.

13. **Client wrapper conventions.** Construct the `ApifyClient` with a request interceptor that injects
    telemetry headers (`x-apify-integration-platform: <host>`, `x-apify-integration-ai-tool: true`) —
    these are analytics, not auth. Token resolution follows the credential resolution order in the
    [Credential resolution](#credential-resolution) section above. The Apify API key is shared with
    sibling integration tools (e.g. the web search provider integration). Run `normalizeSecretInput`
    (strip `\r`, `\n`, U+2028/U+2029 and surrounding whitespace) on the token. **SSRF guard:** if
    `baseUrl` is overridable, require it to start with `https://api.apify.com` and reject anything
    else.

14. **Config surface (keep it small).** `enabled` (hard kill switch; if unset, auto-enable **iff** a
    key is present so a keyless install registers nothing), `apiKey`, `baseUrl`, `maxResults`,
    `enabledTools`. Explicit `enabled: false` always wins.

15. **A small human CLI: `setup` / `status` / `test`.** Not part of the agent tool surface.
    `setup` is an interactive wizard that verifies the key against `client.user("me").get()` and
    (with consent) writes config back. `status`/`test` verify connectivity via the cheapest
    authenticated endpoint (`user("me")`) and print the account/plan. **Never echo the full key** —
    fingerprint it (first ~12 chars).

---

## Security model — the four threats

Every Apify plugin must address all four:

1. **Prompt injection via scraped content** → external-content wrapping (principle 11).
2. **Credential exfiltration via a misconfigured `baseUrl`** → `https://api.apify.com` allowlist
   (principle 13).
3. **Credential leakage in logs / tool output** → never echo the key; fingerprint in CLI output.
4. **Newline injection in copy-pasted keys** → `normalizeSecretInput` before any use.

---

## New-plugin checklist

Run this against any new Apify integration plugin (build or review):

- [ ] Exactly one agent-callable tool (`apify`) with `discover` / `start` / `collect`.
- [ ] `start` returns immediately with `{ runId, actorId, datasetId, label }` — no blocking.
- [ ] `collect` returns `{ allDone, completed, pending, errors }` and the agent owns polling.
- [ ] Terminal-status set is exactly `SUCCEEDED | FAILED | ABORTED | TIMED-OUT`; only `SUCCEEDED`
      fetches the dataset.
- [ ] `collect` uses `Promise.allSettled`.
- [ ] Slugs are `username~actor-name` everywhere.
- [ ] `discover` covers both search and schema modes and ends each with a `tip:` next-call hint.
- [ ] No per-Actor input validation in `start`; `label` is a passthrough.
- [ ] Dataset output is truncated to a hard char cap **and** wrapped in untrusted-content markers,
      with the `externalContent` flag set.
- [ ] Tool description carries the workflow, slug format, batching guidance, Actor catalog, and
      sub-agent delegation note.
- [ ] Telemetry headers injected; token resolved from config → `APIFY_API_KEY`; secret normalized.
- [ ] `baseUrl` (if configurable) is allowlisted to `https://api.apify.com`.
- [ ] Config: `enabled` auto-enables iff a key is present; explicit `false` wins.
- [ ] CLI `setup` / `status` / `test` verify via `user("me")` and never echo the full key.
- [ ] All four security threats addressed.

---

## Harness assumptions — verify before deviating

This guide describes the plugin design as it is implemented against the **OpenClaw** harness — the
worked example, the contract slots, the config surface, and the CLI conventions all reflect that
runtime. Other host harnesses are similar in spirit but differ in detail: how tools are registered,
how config is loaded and merged, how secrets are resolved, whether async/multi-turn tool calls are
supported, and whether untrusted-content markers are honored can all vary.

When you hit a place where the target harness does not match what this guide assumes, **do not
silently re-shape the design to fit** — surface the difference to the developer and confirm the
intended approach before deviating. Where the harness imposes no constraint, keep following these
rules so plugins stay consistent across hosts. The point is that deviations are deliberate and
reviewed, not accidental drift from the shared playbook.

---

## When to deviate

The patterns assume a host runtime that (a) supports async/multi-turn tool calls and (b) honors the
untrusted-content markers. Note the gaps explicitly when they don't hold:

- **Host doesn't honor untrusted-content markers** → the wrapping is advisory only. Flag this as a
  residual prompt-injection risk and consider stricter output filtering or sub-agent isolation.
- **Host has no async tool model (single blocking call only)** → you may be forced to fold
  `start`+`collect` into one call. Cap the internal wait aggressively and document the turn-blocking
  trade-off; prefer returning a pending reference the user can re-query if the platform allows it.
- **A target Actor has no array input** → batching guidance (principle 9) doesn't apply for that
  Actor; the agent issues one run per target.