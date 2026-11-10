/**
 * instadata core: a forwarding client for the hosted
 * HasData Instagram MCP server.
 *
 * Nothing is scraped or searched locally. tools/list is
 * answered from the literal definitions below, taken
 * verbatim from a live capture of the upstream server
 * (name, title, description and inputSchema exactly as
 * captured, title key included). A tools/call travels
 * upstream over a streamable-HTTP JSON-RPC session: an
 * initialize POST, a notifications/initialized POST,
 * then the tools/call POST, carrying the Mcp-Session-Id
 * response header on later requests when the upstream
 * issues one. The session opens lazily on the first
 * forwarded call and is reused for the client's life.
 *
 * The endpoint is pinned to
 * https://mcp.hasdata.com/mcp?apis=instagram — the query
 * string belongs to the pinned URL — and may be replaced
 * with the HASDATA_INSTAGRAM_MCP_URL environment variable
 * (that override is a labelled reconstruction). When
 * HASDATA_API_KEY is set, every upstream request carries
 * an `x-api-key: <key>` header (header name pinned by the
 * registry record's remote declaration; forwarding the
 * key from this env var is a labelled reconstruction, as
 * the capture was taken keyless). When it is unset, no
 * key header goes out, and no Authorization header is
 * sent in either case.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures — an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch that
 * throws or times out — become an isError result whose
 * text begins with `instadata error:` (that rendering is
 * a labelled reconstruction). Replies may be plain JSON
 * or SSE (`data:` lines); the JSON-RPC message whose id
 * matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://mcp.hasdata.com/mcp?apis=instagram";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/hasdata-instagram-tools-original.json)  */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "hasdata_instagram_comments_getInstagramComments",
    "title": "instagram_comments: GET /",
    "description": "Get Instagram Comments\n\nFetches the comments on a public Instagram post or reel from its URL (`/p/`, `/reel/` or `/tv/` links, with or without the username segment). The first page returns the post (id, shortcode, caption, hashtags, mentions, likes and comments counts, owner, display image, images, video URL, DASH manifest, hasAudio flag, tagged location, and every carousel item as childPosts) plus the first comments; with includeMusic=true the post also carries music (audioId, artistName, songName) for the reel's licensed track or original sound; later pages return comments only. Each comment has text, timestamp, like count, reply count, and owner (username, verified flag, profile picture, hasdataLink to the profile endpoint). Supports token-based pagination via nextPageToken. Instagram sizes pages server-side (about 10 to 15 comments). Use for sentiment analysis, engagement research, or building comment datasets from posts discovered via the posts API, whose items carry a hasdataLink to this endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "The URL of the Instagram post or reel, for example `https://www.instagram.com/p/Ddjis3vETcP/` or `https://www.instagram.com/instagram/reel/DcymgItMFao/`."
        },
        "nextPageToken": {
          "type": "string",
          "description": "Defines the next page token. Use the `nextPageToken` value returned by the previous response. Omit it to fetch the first page."
        },
        "includeMusic": {
          "type": "boolean",
          "description": "Also return the reel's sound (audio ID, artist and song title) in `post.music`, for both licensed tracks and original audio. This takes an extra request to Instagram on the first page and is ignored when `nextPageToken` is set. Default is false."
        }
      },
      "required": [
        "url"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_instagram_posts_getInstagramPosts",
    "title": "instagram_posts: GET /",
    "description": "Get Instagram Posts\n\nFetches the latest posts of a public Instagram account by username (handle) and returns each post with caption, hashtags, mentions, like and comment counts, play counts on videos and Reels, image and video URLs, and timestamp. Supports token-based pagination via nextPageToken to walk older posts. Private accounts and handles that do not exist or are hidden from logged-out viewers return an error field instead of posts. Use to monitor competitor content, track engagement of creator posts, or build datasets of account content for vetting and analytics.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handle": {
          "type": "string",
          "description": "The Instagram username of the account whose posts you want to scrape, without the `@` symbol."
        },
        "limit": {
          "type": "number",
          "description": "The maximum number of posts to retrieve per request. Defaults to 12."
        },
        "nextPageToken": {
          "type": "string",
          "description": "Defines the next page token. It is used for retrieving the next page results. Use the `nextPageToken` value returned by the previous response."
        }
      },
      "required": [
        "handle"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_instagram_profile_getInstagramProfile",
    "title": "instagram_profile: GET /",
    "description": "Get Instagram Profile\n\nFetches a public Instagram profile by username (handle) and returns full name, biography, external link, profile picture URL, followers count, following count, and verified/private flags. Use to enrich CRM/lead records, verify influencer reach before outreach, monitor competitor accounts, or build datasets of creator metadata for vetting and analytics.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handle": {
          "type": "string",
          "description": "The Instagram username of the profile you want to scrape, without the `@` symbol."
        }
      },
      "required": [
        "handle"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `instadata error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client that holds a single upstream
 * session, opened lazily on first use and reused from
 * then on (for the process lifetime in the MCP server,
 * or for a single invocation in the CLI).
 */
export class InstadataClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).HASDATA_INSTAGRAM_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).HASDATA_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["x-api-key"] = key;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "instadata", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): InstadataClient {
  return new InstadataClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new InstadataClient(deps).callTool(name, args);
}
