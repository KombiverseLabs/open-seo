import { McpServer } from "@modelcontextprotocol/server";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP, type McpProps } from "@/server/mcp/context";
import { handleSelfHostedOpenSeoMcpRequest } from "@/server/mcp/transport";

// The self-hosted /mcp boundary with real Cloudflare Access JWT verification.
// Only the edges are doubled: the Worker env, the team's JWKS endpoint (the
// network), the shared-workspace store (D1), and the tool registry — one tool
// that reports who the request authenticated as.

const TEAM_DOMAIN = "https://openseo-test.cloudflareaccess.com";
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const POLICY_AUD = "openseo-test-application-aud";
const KEY_ID = "access-test-key";
const GATEWAY_CLIENT_ID = "0123456789abcdef0123456789abcdef.access";
const OTHER_CLIENT_ID = "fedcba9876543210fedcba9876543210.access";

// The claim set Access mints for a service-token login: empty `sub`, no
// `email`, the Client ID as `common_name`.
const serviceTokenClaims = {
  type: "app",
  sub: "",
  common_name: GATEWAY_CLIENT_ID,
};
const userClaims = {
  type: "app",
  sub: "7335d417-61da-459d-899c-0a01c76a2f94",
  email: "person@example.com",
  identity_nonce: "nonce",
};

const toolResultSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })).min(1),
  }),
});
const callerSchema = z.object({ userId: z.string(), userEmail: z.string() });

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));

vi.mock("@/middleware/ensure-user/delegated", () => ({
  resolveLocalNoAuthContext: () => {
    throw new Error("local_noauth is not exercised here");
  },
  resolveSharedWorkspaceContext: async (userId: string, userEmail: string) => ({
    userId,
    userEmail,
    emailVerified: true,
    organizationId: "shared-workspace",
    role: "owner",
  }),
}));

vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://open-seo.test",
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {},
}));

vi.mock("@/server/mcp/server", () => ({
  createOpenSeoMcpServer: (props: McpProps) => {
    const server = new McpServer({
      name: "OpenSEO MCP test",
      version: "0.0.0",
    });
    server.registerTool(
      "whoami",
      { description: "Reports the authenticated caller." },
      async () => ({
        content: [
          { type: "text", text: JSON.stringify(props[MCP_AUTH_CONTEXT_PROP]) },
        ],
      }),
    );
    return server;
  },
}));

vi.mock("agents/mcp/server", () => ({
  createMcpHandler: () => async () =>
    new Response("modern-era requests are not exercised here", {
      status: 500,
    }),
}));

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

let signingKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  signingKey = privateKey;
  const publicJwk = { ...(await exportJWK(publicKey)), kid: KEY_ID };
  // jose fetches the team's signing keys by URL string.
  vi.stubGlobal("fetch", async (url: string) => {
    if (url !== CERTS_URL) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return Response.json({ keys: [publicJwk] });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function signAccessJwt(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuer(TEAM_DOMAIN)
    .setAudience([POLICY_AUD])
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
}

async function callWhoami(claims: Record<string, unknown>) {
  const request = new Request("https://open-seo.test/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "cf-access-jwt-assertion": await signAccessJwt(claims),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "whoami", arguments: {} },
    }),
  });
  return handleSelfHostedOpenSeoMcpRequest(
    request,
    "cloudflare_access",
    {},
    ctx,
  );
}

async function callerOf(response: Response) {
  const body = toolResultSchema.parse(await response.json());
  return callerSchema.parse(JSON.parse(body.result.content[0].text));
}

describe("self-hosted /mcp behind Cloudflare Access", () => {
  beforeEach(() => {
    mocks.env.TEAM_DOMAIN = TEAM_DOMAIN;
    mocks.env.POLICY_AUD = POLICY_AUD;
    mocks.env.ACCESS_SERVICE_TOKEN_CLIENT_IDS = `${OTHER_CLIENT_ID}, ${GATEWAY_CLIENT_ID}`;
  });

  it("serves an allowlisted service token as its stable service user", async () => {
    const response = await callWhoami(serviceTokenClaims);

    expect(response.status).toBe(200);
    const caller = await callerOf(response);
    expect(caller.userId).toBe(`access-service-token:${GATEWAY_CLIENT_ID}`);
    expect(caller.userEmail.endsWith(".invalid")).toBe(true);
  });

  it("refuses a service token missing from the allowlist with a JSON 401", async () => {
    mocks.env.ACCESS_SERVICE_TOKEN_CLIENT_IDS = OTHER_CLIENT_ID;

    const response = await callWhoami(serviceTokenClaims);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("serves a signed-in Access user as that user", async () => {
    const response = await callWhoami(userClaims);

    expect(response.status).toBe(200);
    expect(await callerOf(response)).toMatchObject({
      userId: userClaims.sub,
      userEmail: userClaims.email,
    });
  });
});
