# Kombify OpenSEO self-host

Eng-facing note for the KombiverseLabs fork of [every-app/open-seo](https://github.com/every-app/open-seo). No secret values in this repo.

## Deployed state

Deployed with `pnpm deploy:selfhost --yes` (Alchemy stack `open-seo`, stage `selfhost`, state in the account's `alchemy-state-store` Worker): Workers `open-seo-selfhost` and `open-seo-selfhost-audit`, D1 `open-seo-db-selfhost`, served at `https://open-seo-selfhost.soulcreek.workers.dev` (Cloudflare account `Soulcreek`). First deploy 2026-09-04; redeployed 2026-09-11 from `main` `79945528d667498bbe5d1d11a2c1da9927095487` (#3, the service-token principal). Prereqs and bootstrap follow upstream [docs/SELF_HOSTING_CLOUDFLARE.md](./SELF_HOSTING_CLOUDFLARE.md).

Cloudflare Access application `open-seo selfhost` gates the hostname with two policies, both provisioned by `alchemy.run.ts` from `.env.selfhost` (dashboard edits are overwritten on the next deploy):

1. Allow — the emails in `ACCESS_ALLOWED_EMAILS` (interactive sign-in).
2. Service Auth (`non_identity`) — the service-token ids in `ACCESS_SERVICE_TOKEN_IDS`; today the kombify Gateway's token `kombify-gateway-openseo` (expires 2027-09-11).

Leave `TEAM_DOMAIN` and `POLICY_AUD` unset. The deploy derives them itself: the team domain from the Zero Trust organization (`kombiverse.cloudflareaccess.com`), the AUD from the Access application it manages. Setting both switches the stack to a hand-managed Access application; the next deploy would then drop the managed application and its policies from the stack, and Alchemy removes resources that leave the stack.

## DNS hold

**HOLD Live-DNS** until a named Cut from k2 / Marcel. Until then: `workers.dev` + Cloudflare Access only — no custom hostname, no Live-DNS change.

## Secrets

Do not put values in git, chat, or this file. k2 writes Doppler; Eng is read-only.

Gateway side — Doppler project `kombify-io`, config `prd_gateway`:

| Name                                       | Purpose                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `MCP_BACKEND_OPENSEO_ORIGIN`               | The self-host origin (`https://open-seo-selfhost.soulcreek.workers.dev`). |
| `MCP_BACKEND_OPENSEO_ACCESS_CLIENT_ID`     | Client ID of the Access service token `kombify-gateway-openseo`.          |
| `MCP_BACKEND_OPENSEO_ACCESS_CLIENT_SECRET` | Its Client Secret (shown once, at creation).                              |

The self-host does not read `MCP_BACKEND_OPENSEO_BEARER`. OpenSEO API keys (`oseo_…`) exist only in hosted mode: `src/lib/auth.ts` registers the API-key plugin for hosted auth alone, so a self-host never issues or accepts one.

Self-host side — `.env.selfhost` on the deploying machine (gitignored; template: `.env.selfhost.example`), rebuilt from Doppler project `kombination`, config `prd`, and deleted after the deploy:

| `.env.selfhost` key               | Doppler `kombination/prd`                          | Purpose                                                                                        |
| --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATAFORSEO_API_KEY`              | `DATAFORSEO_API_KEY`                               | DataForSEO Base64 `email:password`. See [docs/DATAFORSEO_API_KEY.md](./DATAFORSEO_API_KEY.md). |
| `ACCESS_ALLOWED_EMAILS`           | `ACCESS_ALLOWED_EMAILS`                            | Comma-separated emails allowed to sign in through Cloudflare Access.                           |
| `OPENSEO_TELEMETRY_DISABLED`      | `OPENSEO_TELEMETRY_DISABLED`                       | `1` opts out of anonymized OpenSEO telemetry.                                                  |
| `ACCESS_SERVICE_TOKEN_IDS`        | `OPENSEO_SELFHOST_ACCESS_SERVICE_TOKEN_IDS`        | Service-token ids Access admits without a login (token ids, not secrets).                      |
| `ACCESS_SERVICE_TOKEN_CLIENT_IDS` | `OPENSEO_SELFHOST_ACCESS_SERVICE_TOKEN_CLIENT_IDS` | Client IDs of the tokens the app serves as a workspace principal.                              |
| `BETTER_AUTH_SECRET`              | `OPENSEO_SELFHOST_BETTER_AUTH_SECRET`              | Keys the Search Console OAuth-token encryption; must stay stable once Search Console is used.  |

Google Search Console, OpenRouter, and PostHog are not configured on this deployment.

Cloudflare credentials for the deploy: `CLOUDFLARE_EMAIL` and `CLOUDFLARE_GLOBAL_API_KEY` (exported as `CLOUDFLARE_API_KEY`) from `kombination/prd`, `CLOUDFLARE_ACCOUNT_ID` from `kombify-io/prd_cloudflare`. The API token in `kombify-io/prd_cloudflare` cannot read this account's Workers. Alchemy takes environment credentials through an env-method profile, created once with `CI=1 pnpm alchemy login`; run the deploy with `CI=1` too, so the state-store token is not cached on disk.

On Windows, deploy from a checkout with `core.autocrlf=false`: a CRLF checkout hands CRLF skill files to SAM's frontmatter parser, which rejects them (`samSkills.test.ts` fails on such a checkout). Run the pnpm scripts through Git Bash (`npm_config_script_shell="C:/Program Files/Git/bin/bash.exe"`), because `cmd.exe` cannot run the `alchemy` script's `NODE_OPTIONS=…` prefix. `pnpm alchemy plan --env-file .env.selfhost --stage selfhost` shows the changes before a deploy.

## Gateway → `/mcp`

The kombify Gateway calls `https://open-seo-selfhost.soulcreek.workers.dev/mcp` with the service-token headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) and nothing else. Access admits the token and forwards a JWT that has no user — `sub` is empty, there is no `email`, and `common_name` is the Client ID ([Cloudflare: application token](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/)). `src/middleware/ensure-user/cloudflareAccess.ts` serves a Client ID listed in `ACCESS_SERVICE_TOKEN_CLIENT_IDS` as the user `access-service-token:<client-id>` (email `<client-id>@access-service-token.invalid`, the address `whoami` reports) in the shared workspace. A token that passes Access without being listed gets a JSON-RPC error with HTTP 401.

Passing Access and getting the workspace are separate lists on purpose: a token in `ACCESS_SERVICE_TOKEN_IDS` alone reaches `/api/health` but no app data.

Verified 2026-09-11 after the redeploy: `whoami` reports the service principal both with the service-token headers alone and through the Gateway (`kombify-gateway_call_tool`, server `openseo-mcp`); without the headers, `/` and `/mcp` redirect to the Access login.

The Managed OAuth flow in [docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) serves interactive MCP clients, not the Gateway.

## Upstream sync

Track a pinned upstream tag. Upstream is at `v0.1.7`; `main` carries upstream `main` (`3632f40`, just past that tag) plus the fork commits. To move: fetch the new tag from upstream, merge it into `main`, then redeploy with `pnpm deploy:selfhost --yes`.

## Product holds

Out of the first Sidecar slice:

- HITL SEO is **never-auto**. Publish stays with CMO.
- No Auto-Publish.
- No Deep-Desk-Embed.
- Supply-Dock / SEO-Agent-Type come later.
