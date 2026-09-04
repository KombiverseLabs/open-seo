# Kombify OpenSEO self-host (pre-Go scaffold)

Eng-facing note for the KombiverseLabs fork of [every-app/open-seo](https://github.com/every-app/open-seo). This is a **pre-Go scaffold only**: no Wrangler/Alchemy deploy, no Live-DNS, no secret values in this repo.

After Go, Eng deploys from this note. k2 writes Doppler; Eng is read-only.

## Placement

Cloudflare Sidecar via Alchemy. After Go, deploy with:

```bash
pnpm deploy:selfhost --yes
```

Follow upstream [docs/SELF_HOSTING_CLOUDFLARE.md](./SELF_HOSTING_CLOUDFLARE.md) (prereqs, `pnpm alchemy login` with `access:write`, bootstrap, `.env.selfhost`). Day-two MCP/telemetry: [docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md).

## DNS hold

**HOLD Live-DNS** until a named Cut from k2 / Marcel.

Until that Cut: `workers.dev` + Cloudflare Access only. Do not attach a custom hostname or change Live-DNS.

## Secrets (Doppler)

k2 writes. Eng is read-only. Do not put values in git, chat, or this file.

Doppler project: `<DOPPLER_PROJECT>` (TBD — do not invent)
Doppler config: `<DOPPLER_CONFIG>` (TBD — do not invent)

Required:

| Secret | Purpose |
| --- | --- |
| `DATAFORSEO_API_KEY` | DataForSEO Base64 `email:password`. See [docs/DATAFORSEO_API_KEY.md](./DATAFORSEO_API_KEY.md). |
| `ACCESS_ALLOWED_EMAILS` | Comma-separated emails allowed through Cloudflare Access. |

Optional:

| Secret | Purpose |
| --- | --- |
| `OPENSEO_TELEMETRY_DISABLED` | Set to `1` to opt out of anonymized OpenSEO telemetry. |

## Post-deploy (after Go)

Enable Zero Trust Access **Managed OAuth** so MCP clients can register. MCP URL:

```text
https://<worker>/mcp
```

Steps: [docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md).

## First-slice product holds

These stay out of the first Sidecar slice:

- HITL SEO is **never-auto**. Publish stays with CMO.
- No Auto-Publish.
- No Deep-Desk-Embed.
- Supply-Dock / SEO-Agent-Type come later.

## Go blockers

Do not deploy until all of these are true:

1. DataForSEO key exists in Doppler (`DATAFORSEO_API_KEY`).
2. Access allow-list exists in Doppler (`ACCESS_ALLOWED_EMAILS`).
3. Cloudflare R2 has a payment method on file (required even on the free tier).
4. Alchemy login has `access:write` (`pnpm alchemy login` — customize OAuth scopes; use `pnpm alchemy login --configure` if a prior login omitted it).

## Out of scope for this note

- No `wrangler deploy`, no `pnpm deploy:selfhost` until Go.
- No Live-DNS / custom domain until the named Cut.
- No secret values, and no invented Doppler project/config names.
