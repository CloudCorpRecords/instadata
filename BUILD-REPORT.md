# BUILD REPORT — instadata

Rebuild of `com.hasdata/instagram` v1.0.8 (remote-only, keyless capture)
as `@reneturcios/instadata` 0.1.0 / `io.github.CloudCorpRecords/instadata`.

## Fixture conflicts

**None.** The brief, the spec prose, and the fixture agree on all three
tool names and their required fields. Required fields as served, taken
from the fixture (`harness/fixtures/hasdata-instagram-tools-original.json`):

- `hasdata_instagram_comments_getInstagramComments` — required: `url`
- `hasdata_instagram_posts_getInstagramPosts` — required: `handle`
- `hasdata_instagram_profile_getInstagramProfile` — required: `handle`

The fixture's tool literals (name, title, description, inputSchema —
including the `title` keys, every property description,
`additionalProperties: false`, and the `$schema` key) are served
verbatim from `src/forward.ts`; the literals were generated
programmatically from the fixture JSON (parsed and re-serialised, not
retyped) and verified by the registration-integrity test (served
tools/list deep-equals the fixture's 3 tool objects) and again by the
parity harness.

## What was built

All 19 factory files under `builds/instadata/`:

- `package.json` (`@reneturcios/instadata` 0.1.0, bin
  `instadata` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 95-char string
  "Instagram public data as JSON: profile by handle, latest posts, and comments on a post or reel.";
  npm entry carries `"version": "0.1.0"`; OCI entry
  `ghcr.io/cloudcorprecords/instadata:0.1.0` carries **no** version field)
- `Dockerfile` (node:20-alpine both stages; server-name label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/instadata"`
  matches `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-28)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/instadata`, smoke assertion on server name
  `instadata`)

Plus `BUILD-REPORT.md` (this file) and the `parity-out/` harness output.

## Design

- Forwarding client to `https://mcp.hasdata.com/mcp?apis=instagram`
  (pinned; the query string is part of the pinned URL), overridable via
  `HASDATA_INSTAGRAM_MCP_URL` (labelled reconstruction). tools/call is
  forwarded as a streamable-HTTP JSON-RPC client: initialize
  (protocolVersion `2025-03-26`, clientInfo `instadata`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id`
  when issued; session established lazily and reused per client.
  Plain-JSON and SSE replies both parsed; the matching-id message
  wins; upstream results pass through verbatim (including `isError`
  and extra fields such as `structuredContent`).
- When `HASDATA_API_KEY` is set, an `x-api-key` header is
  sent on every upstream request (header name pinned by the registry
  record's remote declaration; forwarding it from this env var is a
  labelled reconstruction — the capture was keyless). When unset, no
  key header is sent. No `Authorization` header is sent in either
  case. Both branches are covered by tests.
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `instadata error:` text
  results (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration
  (per the task brief, overriding TEMPLATE.md §2 item 12).
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere. The captured surface is three
  read-only fetches over public Instagram content; no posting, sending,
  following, or storing tool exists in the surface — none was added,
  and no email or phone of any individual appears in it.

## Lockfile (Route 3, clean from birth)

Generated in a temp dir (`/tmp/instadata-lock`) containing only the
new `package.json`, with no `node_modules` present:
`npm install --package-lock-only --ignore-scripts --offline`.
Verified: parses, `name == @reneturcios/instadata`,
**128 package entries**; placed into the build dir with matching
sha256 (`35e8d542…d9ff1e` on both sides: full value
`35e8d542c21111a3c8d7d614c6f02d9c33dccb0dfe6399bcad831c9878d9ff1e`).
Then `npm install --offline --ignore-scripts` in the build dir for
`node_modules`; the build-dir lockfile sha256 was re-verified
unchanged after that install.

## Verification (all in the build dir unless noted)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js, forward.js, mcp.js, all
  non-empty, with `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2 (covered in the CLI test suite)
- `npm test` → **54 tests, 54 pass, 0 fail** (8 suites: registration
  integrity — served tools deep-equal the fixture's full 3 tool
  objects, names in order, exactly the fixture's keys incl. title,
  required fields per tool, every property key in order for all three
  tools, property types, additionalProperties/$schema, isKnownTool;
  session establishment/reuse/session-id handling, clientInfo/protocol
  version; env URL override, explicit url override, explicit-over-env
  precedence, blank-env fallback; x-api-key header present on every
  request when the key is set / absent when unset / no Authorization
  header in either case; verbatim argument forwarding for all three
  tools incl. fully-specified comments and posts calls, a minimal
  posts call, and a profile call; verbatim result pass-through incl.
  upstream isError and SSE; JSON-RPC/init/malformed/no-result/HTTP/
  throw/timeout failures → `instadata error:`; parseRpcBody JSON +
  SSE + matching-id + [DONE] cases; MCP-layer MethodNotFound /
  InvalidParams validation; CLI --version / -v / unknown exit 2 /
  bad-JSON exit 2 / `mcp extra` exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/hasdata-instagram-tools-original.json --rebuild
  "stdio:node builds/instadata/dist/cli.js mcp" --out
  builds/instadata/parity-out` (run from `~/workspace/mcp-rebuild-100`)
  → **PASS, parity 100.0, 3/3 identical, no missing/extra/schema
  diffs** (see `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 95 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh for instadata; only the
mechanics were patterned on the sibling glassdata build, and only the
fixture's tool literals are served verbatim.
