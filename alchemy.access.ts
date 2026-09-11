// The contract shared by the two email-gated Cloudflare Access boundaries —
// the persistent preview wildcard (alchemy.preview-access.run.ts) and the
// per-stage self-host gate (alchemy.run.ts). Worker naming, the
// WORKERS_SUBDOMAIN shape, the allowed-emails and service-token parsing, and
// the policy/application shape define who gets through which hostnames; keep
// them in one place so the two gates cannot drift. The one copy that can't
// import this module is the shell in .github/workflows/pr-preview.yml — its
// `open-seo-<stage>` naming stays comment-synced (and is backstopped by the
// workflow's Access verify step).

import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const WORKER_PREFIX = "open-seo";

// The one stage that adopts openseo.so's live hosted resources (unsuffixed
// names, app.openseo.so domain, Postgres). Deliberately not "prod" so a
// self-hoster's stage name can't collide with the adoption path.
export const HOSTED_PROD_STAGE = "hosted-prod";

export const workerName = (stage: string) =>
  stage === HOSTED_PROD_STAGE ? WORKER_PREFIX : `${WORKER_PREFIX}-${stage}`;

// Matches every preview worker hostname; production's unsuffixed worker does
// not match (Access allows one wildcard per dot-label).
export const previewWildcard = (subdomain: string) =>
  `${WORKER_PREFIX}-*.${subdomain}`;

export const readWorkersSubdomain = ({ required }: { required: boolean }) =>
  Effect.gen(function* () {
    const subdomain = (yield* Config.string("WORKERS_SUBDOMAIN").pipe(
      Config.withDefault(""),
    )).trim();
    if (subdomain.endsWith(".workers.dev") || (!subdomain && !required)) {
      return subdomain;
    }
    return yield* Effect.die(
      new Error(
        `Set WORKERS_SUBDOMAIN to the account's full workers.dev subdomain (shown under Workers & Pages)${required ? "." : ", or leave it unset."}`,
      ),
    );
  });

/** Reads ACCESS_ALLOWED_EMAILS; dies with `remedy` when none are set. */
export const requireAllowedEmails = (remedy: string) =>
  Effect.gen(function* () {
    const emails = (yield* Config.string("ACCESS_ALLOWED_EMAILS").pipe(
      Config.withDefault(""),
    ))
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      return yield* Effect.die(new Error(remedy));
    }
    return emails;
  });

const SERVICE_TOKEN_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Reads ACCESS_SERVICE_TOKEN_IDS: the Cloudflare Access service-token ids
 * (comma-separated) admitted without a login. Empty when unset. Dies on a
 * value that is not a token id, so a pasted Client ID or Client Secret never
 * reaches the Cloudflare API as policy configuration.
 */
export const readServiceTokenIds = Effect.gen(function* () {
  const ids = (yield* Config.string("ACCESS_SERVICE_TOKEN_IDS").pipe(
    Config.withDefault(""),
  ))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const malformed = ids.find((id) => !SERVICE_TOKEN_ID.test(id));
  if (malformed !== undefined) {
    return yield* Effect.die(
      new Error(
        `ACCESS_SERVICE_TOKEN_IDS entry "${malformed}" is not a service-token id — use the token's ID (a UUID, shown under Zero Trust → Access → Service auth), not its Client ID or Client Secret.`,
      ),
    );
  }
  return ids;
});

/**
 * The gate itself: an email allow-policy on a self-hosted Access application.
 * With service-token ids, a second `non_identity` policy admits those tokens
 * without a login (machine callers such as an MCP gateway). Policy order is
 * precedence order; the email policy stays first.
 */
export const emailAccessGate = (options: {
  policyId: string;
  applicationId: string;
  policyName: string;
  applicationName: string;
  domain: string;
  emails: string[];
  serviceTokens?: { policyId: string; policyName: string; tokenIds: string[] };
}) =>
  Effect.gen(function* () {
    const allow = yield* Cloudflare.Access.Policy(options.policyId, {
      name: options.policyName,
      decision: "allow",
      include: options.emails.map((email) => ({ email: { email } })),
    });
    const serviceTokens =
      options.serviceTokens && options.serviceTokens.tokenIds.length > 0
        ? yield* Cloudflare.Access.Policy(options.serviceTokens.policyId, {
            name: options.serviceTokens.policyName,
            decision: "non_identity",
            include: options.serviceTokens.tokenIds.map((tokenId) => ({
              serviceToken: { tokenId },
            })),
          })
        : undefined;
    return yield* Cloudflare.Access.Application(options.applicationId, {
      type: "self_hosted",
      name: options.applicationName,
      domain: options.domain,
      policies: serviceTokens
        ? [allow.policyId, serviceTokens.policyId]
        : [allow.policyId],
    });
  });
