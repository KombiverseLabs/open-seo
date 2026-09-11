# Kombify OpenSEO self-host

Eng-facing note for the KombiverseLabs fork of [every-app/open-seo](https://github.com/every-app/open-seo). No secret values in this repo.

## Deployed state

Deployed 2026-09-04 with `pnpm deploy:selfhost --yes` (Alchemy stack `open-seo`, stage `selfhost`): Workers `open-seo-selfhost` and `open-seo-selfhost-audit`, D1 `open-seo-db-selfhost`, served at `https://open-seo-selfhost.soulcreek.workers.dev`. Prereqs, `pnpm alchemy login` with `access:write`, bootstrap, and `.env.selfhost` follow upstream [docs/SELF_HOSTING_CLOUDFLARE.md](./SELF_HOSTING_CLOUDFLARE.md).

Cloudflare Access application `open-seo selfhost` gates the hostname with two policies, both provisioned by `alchemy.run.ts` from `.env.selfhost` (dashboard edits are overwritten on the next deploy):

1. Allow — the emails in `ACCESS_ALLOWED_EMAILS` (interactive sign-in).
2. Service Auth (`non_identity`) — the service-token ids in `ACCESS_SERVICE_TOKEN_IDS`; today the kombify Gateway's token `kombify-gateway-openseo` (expires 2027-09-11).

The service-token policy live today was attached by hand through the API on 2026-09-11. The next `pnpm deploy:selfhost` replaces it with the alchemy-managed one, so `ACCESS_SERVICE_TOKEN_IDS` must be set in `.env.selfhost` before that deploy or the Gateway loses access.

## DNS hold

**HOLD Live-DNS** until a named Cut from k2 / Marcel. Until then: `workers.dev` + Cloudflare Access only — no custom hostname, no Live-DNS change.

## Secrets

Do not put values in git, chat, or this file. k2 writes Doppler; Eng is read-only.

Gateway side — Doppler project `kombify-io`, config `prd_gateway`:

| Name                                       | Purpose                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `MCP_BACKEND_OPENSEO_ORIGIN`               | The self-host origin (`https://open-seo-selfhost.soulcreek.workers.dev`).             |
| `MCP_BACKEND_OPENSEO_BEARER`               | An OpenSEO API key (`oseo_…`) the owner creates in the app under Settings → API keys. |
| `MCP_BACKEND_OPENSEO_ACCESS_CLIENT_ID`     | Client ID of the Access service token `kombify-gateway-openseo`.                      |
| `MCP_BACKEND_OPENSEO_ACCESS_CLIENT_SECRET` | Its Client Secret (shown once, at creation).                                          |

Self-host side — `.env.selfhost` on the deploying machine only (gitignored; template: `.env.selfhost.example`):

| Name                         | Purpose                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATAFORSEO_API_KEY`         | DataForSEO Base64 `email:password`. See [docs/DATAFORSEO_API_KEY.md](./DATAFORSEO_API_KEY.md). |
| `ACCESS_ALLOWED_EMAILS`      | Comma-separated emails allowed to sign in through Cloudflare Access.                           |
| `ACCESS_SERVICE_TOKEN_IDS`   | Comma-separated Access service-token ids admitted without a login (token ids, not secrets).    |
| `OPENSEO_TELEMETRY_DISABLED` | Set to `1` to opt out of anonymized OpenSEO telemetry.                                         |

## Gateway → `/mcp`

The kombify Gateway calls `https://open-seo-selfhost.soulcreek.workers.dev/mcp` with the service-token headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) plus `Authorization: Bearer oseo_…`. The API-key path is the supported one. Verified 2026-09-11: `GET /api/health` with the service-token headers returns 200 from OpenSEO.

Known: a POST to `/mcp` behind the service token but without an API key currently answers HTTP 500 `error code: 1101` (Worker exception) — not a usable path. The Managed OAuth flow in [docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) serves interactive MCP clients, not the Gateway.

## Upstream sync

Track a pinned upstream tag. Upstream is at `v0.1.7`; `main` carries upstream `main` (`3632f40`, just past that tag) plus the fork commits. To move: fetch the new tag from upstream, merge it into `main`, then redeploy with `pnpm deploy:selfhost --yes`.

## Product holds

Out of the first Sidecar slice:

- HITL SEO is **never-auto**. Publish stays with CMO.
- No Auto-Publish.
- No Deep-Desk-Embed.
- Supply-Dock / SEO-Agent-Type come later.
