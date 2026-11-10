# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted HasData Instagram MCP server, serving the three captured tools locally for tools/list and forwarding every tools/call upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when issued).
- Tools: `hasdata_instagram_comments_getInstagramComments`, `hasdata_instagram_posts_getInstagramPosts`, and `hasdata_instagram_profile_getInstagramProfile`.
- Upstream results pass through verbatim; upstream failures surface as `instadata error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). Upstream endpoint overridable via `HASDATA_INSTAGRAM_MCP_URL`; when `HASDATA_API_KEY` is set it is sent as an `x-api-key` header.
