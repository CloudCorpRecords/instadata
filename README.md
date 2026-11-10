# instadata

instadata is a thin local bridge to the hosted HasData
Instagram MCP server, which returns public Instagram
content as JSON. Point it at a handle and it can bring
back that account's profile — full name, biography,
external link, profile picture, follower and following
counts, and the verified and private flags — or the
account's latest posts, with captions, hashtags,
mentions, like and comment counts, play counts on
videos and Reels, media URLs, and timestamps. Give it
a post or reel URL instead and it returns the comments
on that post, each with its text, timestamp, like and
reply counts, and its author.

The bridge stores nothing and scrapes nothing itself.
It answers the tool list locally, exactly as captured
from the live endpoint, and forwards each tool call
upstream, handing the reply back untouched. The whole
surface is three read-only lookups over public
content: nothing is posted, messaged, followed, or
stored, and no email or phone data appears anywhere
in it.

## Tools

- `hasdata_instagram_profile_getInstagramProfile` —
  one public profile by handle. Required: `handle`
  (the username, without the `@`). Returns full name,
  biography, external link, profile picture URL,
  followers count, following count, and the
  verified/private flags.
- `hasdata_instagram_posts_getInstagramPosts` — the
  latest posts of a public account. Required:
  `handle`. Optional: `limit` (posts per request,
  defaults to 12 upstream) and `nextPageToken` to
  walk older posts. Private accounts and handles
  that do not exist return an error field instead
  of posts.
- `hasdata_instagram_comments_getInstagramComments` —
  the comments on a public post or reel. Required:
  `url` (a `/p/`, `/reel/` or `/tv/` link, with or
  without the username segment). Optional:
  `nextPageToken` for later pages and `includeMusic`
  to also return the reel's sound (audio ID, artist
  and song title) on the first page. The first page
  also carries the post itself, including carousel
  items; later pages return comments only.

## Configuration

- `HASDATA_INSTAGRAM_MCP_URL` (optional) — override
  the upstream endpoint. Defaults to
  `https://mcp.hasdata.com/mcp?apis=instagram`. (The
  override hook is this rebuild's own labelled
  reconstruction.)
- `HASDATA_API_KEY` (optional) — when set, every
  upstream request carries an `x-api-key: <value>`
  header, for the caller's own HasData API key. When
  it is not set, no key header is sent. (The header
  name and the env name are pinned by the original's
  registry record; forwarding the key from this env
  var is a labelled reconstruction — the original
  surface was captured keyless.)

### Forwarding mechanics

The first tool call opens a streamable HTTP session
upstream: a JSON-RPC `initialize` request
(protocolVersion `2025-03-26`, clientInfo name
`instadata`), then a `notifications/initialized`
notification, then the `tools/call` request carrying
the caller's arguments unchanged. If the upstream
answers `initialize` with an `Mcp-Session-Id`
header, that value rides on every later request of
the session, which is reused for the life of the
process. Replies may arrive as plain JSON or as
server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `instadata error:` (this rendering
is this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string:

```bash
npx @reneturcios/instadata hasdata_instagram_profile_getInstagramProfile '{"handle":"instagram"}'
npx @reneturcios/instadata hasdata_instagram_posts_getInstagramPosts '{"handle":"instagram","limit":5}'
npx @reneturcios/instadata hasdata_instagram_comments_getInstagramComments '{"url":"https://www.instagram.com/p/Ddjis3vETcP/"}'
npx @reneturcios/instadata --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/instadata mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "instadata": {
      "command": "npx",
      "args": ["-y", "@reneturcios/instadata", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/instadata
docker run --rm ghcr.io/cloudcorprecords/instadata --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
