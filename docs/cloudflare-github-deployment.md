# Illinois Venture Radar: GitHub Actions → Cloudflare Workers

This is the **independent deployment path**. No ChatGPT Sites publication, runtime,
identity, or database is used. GitHub is the source of truth: source changes and
tests live in this repository; deployment is a manual, reviewable GitHub Actions
workflow. Cloudflare is only the running host (Workers + D1 + Access).

## Existing credentials

Configure in **GitHub → Settings → Secrets and variables → Actions**:

| GitHub setting | Name | Purpose |
| --- | --- | --- |
| Repository secret | `CLOUDFLARE_API_TOKEN` | Restricted Cloudflare API token, Workers Scripts Edit and D1 Edit on one account |
| Repository variable | `CLOUDFLARE_ACCOUNT_ID` | Selected Cloudflare account, 32 hex characters |
| Repository variable | `IVR_ACCESS_TEAM_DOMAIN` | Exact Access team origin, such as `https://example.cloudflareaccess.com` |
| Repository variable | `IVR_ACCESS_AUD` | Access **application audience (AUD) tag** for the intended Worker |
| Optional repository variable | `IVR_ADMIN_EMAIL` | Email allowed to review candidates and refresh sources, once signed in through Access |

`IVR_ACCESS_AUD` is **not** your Account ID or a secret API token. Obtain it
from the Access application settings. Only an Access-protected user with a
valid cryptographically signed Access JWT can use the application.

## One-time Cloudflare Access setup (required for usable sign-in)

1. Find your Cloudflare **Workers subdomain** in Workers & Pages, e.g.
   `<account-subdomain>.workers.dev`.
2. The future Worker hostname will be
   `illinois-venture-radar.<account-subdomain>.workers.dev`.
3. In **Cloudflare Zero Trust → Access → Applications**, configure a
   **self-hosted Access application** protecting precisely that hostname.
   Choose a sign-in method/policy that permits your own account (for example,
   your verified email). Configure access **before** deployment so the first
   published Worker is gated. Alternatively use Cloudflare's Worker-level Access
   protection after initial provisioning, but the site will deliberately show
   `403` until the Access application and AUD are configured.
4. Find your Access **team domain** and **Application Audience (AUD) Tag** in
   Cloudflare Zero Trust. Save both as GitHub Actions variables listed above.
5. Avoid unauthenticated bypass policies and don't configure the Worker to
   trust incoming `oai-authenticated-user-*` headers directly.

The Worker verifies the **signature, issuer, audience, issued/expiry bounds,
email and identity** of every Access JWT against Cloudflare's rotating JWKS
and replaces forged user headers before calling the app. Without valid Access
identity, every app/API request is denied even if somebody guesses a URL.

Official documentation:
https://developers.cloudflare.com/workers/configuration/cloudflare-access/
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## Deployment and database

After merging the deployment PR into **main**, navigate to:

**GitHub → Actions → Deploy Illinois Venture Radar to Cloudflare (manual) → Run workflow**.

Select branch `main`. Select `create_d1=true` **only when creating the
dedicated application database the first time**. The workflow:

1. Validates credentials and Access configuration without printing secrets.
2. Runs the full Node test suite, TypeScript validation and lint.
3. Finds the D1 database named `illinois-venture-radar`, or explicitly
   provisions it if permitted. It will **not** use the managed Sites database.
4. Produces a **separate** Cloudflare Vite/Vinext build from
   `vite.cloudflare.config.ts`, then checks its Worker entrypoint, Access
   configuration and real database binding.
5. Applies tracked migrations `drizzle/0000_first_drax.sql` and
   `drizzle/0001_source_refresh.sql`. The D1 migration table prevents repeat
   applications.
6. Imports reviewed public startup data **only if this workflow just created
   the database**. Existing D1 contents are never wiped or automatically
   overwritten. Do not run the seed manually against an existing private
   dataset.
7. Deploys the Worker with Wrangler.

If your database already existed but hasn't been seeded, review the schema and
seed strategy explicitly rather than trying to bypass the safe-guard.
The source data starts with the 29 verified initial company records; no
personal/private ChatGPT Sites data is copied to the standalone deployment.

The Worker URL is displayed by Wrangler in the deployment job. For ordinary
deployments after initial provision, leave `create_d1=false`.

## Post-deployment checks

- Open the Worker URL in a clean browser. Cloudflare Access should require
  an allowed login; unauthorized users must not see API responses or notes.
- Once signed in, test Discover, company evidence drawers, Research/Watchlists,
  Sources, exports, and the admin candidate review gate.
- Update GitHub Actions variable `IVR_BROWSERSTACK_SITE_URL` to the new
  `https://...` Worker origin, then run the opt-in BrowserStack mobile smoke
  workflow. A smoke on an Access login screen confirms reachability and the
  sign-in gate **only**; full authenticated end-to-end tests need a supported
  test sign-in session.
- Scheduled ingestion and Honeybadger monitoring require a **separate**
  `IVR_ADMIN_TOKEN` securely set on the running Worker and the GitHub
  refresh workflow; they're **not** enabled by this deployment.

## Safety and boundaries

- No build/preview tests send secrets to Cloudflare or change production.
- The deploy job requires an explicit `workflow_dispatch` on `main`.
- If the Access variables or Cloudflare account token are missing, deployment
  fails before remote D1 work.
- Source repository credentials cannot migrate data from the managed Sites D1.
- Updating GitHub `main` does not automatically deploy: trigger the action.
- Initial Worker deployment requires a separate Cloudflare account and may
  incur usage charges depending on your plan.

