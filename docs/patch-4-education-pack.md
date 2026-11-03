# Patch 4 — GitHub Student Developer Pack integrations

**Status: complete in code, credentials not supplied, external services not activated.**
This patch is additive. It does not migrate the app to another database, change the
independent VC-discovery mission, alter verified company claims, rewrite authentication,
or deploy the private ChatGPT Site. The branch is
`patch-4/education-pack-integrations`. The hosted site will not change until a
separately approved deployment is performed.

## Review of relevant Student Developer Pack benefits

I reviewed the current [GitHub Education Student Developer Pack](https://education.github.com/pack/)
and the [GitHub Education partner change log](https://github.com/github-education-resources/Student-Developer-Pack-Current-Partners-FAQ/blob/main/SDP-changelog.md).
Offers may change, require eligibility verification or redemption, and may have
duration, usage and regional limits. **These are available offers, not verified
redemptions on the owner's account.**

| Pack tool | Decision for this codebase | Why |
| --- | --- | --- |
| **Honeybadger** | **Integrated, awaiting check-in URL** | Monitors when the scheduled official-source refresh quietly stops or fails |
| **Simple Analytics** | **Integrated, optional and off** | Aggregate usage insights without identifying VC research notes or company records |
| **BrowserStack Automate Mobile** | **Integrated, awaiting account credentials** | Real-device mobile browser smoke on a public sign-in/entry surface, no production test user required |
| **Codecov** | **Integrated, awaiting repo token and opt-in** | JUnit results and historical test-failure analytics beyond the existing GitHub Actions pass/fail |
| **GitHub Codespaces** | **Ready, no key** | Repeatable Node 22 + pnpm 11 development environment with stable local ports |
| **GitHub dependency updates (Dependabot)** | **Configured, no key** | Weekly reviewable pnpm/npm and GitHub Actions dependency update PRs |
| Sentry / Datadog / New Relic | Deferred | Overlapping error/APM monitoring; add one later if aggregate cron monitoring proves insufficient |
| ConfigCat / DevCycle | Deferred | Remote feature flags add operational dependencies; current refreshes are intentionally review/opt-in controlled |
| MongoDB / Appwrite / Heroku / Azure | Deferred | Existing Cloudflare D1/Drizzle, site runtime and ChatGPT authentication should be preserved |
| Clerk | Deferred | Would duplicate or replace the trusted ChatGPT identity pipeline |
| Zyte Scrapy Cloud | Deferred | Separate crawler platform is unnecessary and cannot justify bypassing robots/access restrictions |
| 1Password / CodeScene / JetBrains / GitHub Copilot / Polypane / LambdaTest | Optional personal developer tools | Useful for secrets, code review, IDE or cross-browser development, but not secrets or runtime libraries that should be embedded in this repository |
| DigitalOcean credits | Not selected | GitHub Education's change log says this offer left on July 31, 2026; do not build production plans on it |

## 1. Honeybadger — scheduled official-source heartbeat

**Files:** `core/education-monitoring.mjs`, `scripts/refresh-site.mjs`,
`.github/workflows/refresh-public-sources.yml`.

The existing GitHub Actions source-refresh job runs daily at 10:17 UTC, and on
Mondays includes the broader directory, program and verified award sources.
After **all** scheduled connectors succeed, it optionally makes one GET request
to your Honeybadger check-in endpoint. Any failing source prevents the
heartbeat and fails the GitHub Actions job. Manual runs deliberately do **not**
send a heartbeat, so they cannot conceal a missed scheduled run.

The check-in endpoint is an opaque credential, not an ordinary URL.
The code permits only
`https://api.honeybadger.io/v1/check_in/...` or the official EU API origin,
rejects redirects and unexpected paths, and never logs the ID, user research,
company names, private notes, source counts, or response bodies. An absent
endpoint is a no-op. This does **not** report exceptions or personal data.

**To activate:** redeem [Honeybadger Student Pack](https://education.github.com/pack/);
create a **Cron** check-in matching `17 10 * * *` in UTC with a suitable
grace period (e.g. 30–60 minutes for delayed GitHub jobs). In the GitHub
repository's **Settings → Secrets and variables → Actions → Secrets**, add
`IVR_HONEYBADGER_CHECKIN_URL` with the private report URL. Keep
`IVR_AUTOMATION_ENABLED=false` until the underlying site and source schedule
are already deployed, authenticated, migration-tested and intentionally enabled.
Honeybadger cannot report on a refresh until that workflow actually runs.

## 2. Simple Analytics — optional privacy-aware usage

**Files:** `app/layout.tsx`, `public/ivr-analytics-path.js`.

By default no Simple Analytics script loads. Once the operator explicitly
sets `IVR_SIMPLE_ANALYTICS_ENABLED=true` **in the deployed application's**
environment and performs a production build/deploy, the documented
Simple Analytics script is loaded. It respects Do Not Track
(`data-collect-dnt="false"`), does not opt into URL query parameter collection,
ignores company-detail, account/auth, private research, watchlist, compare,
settings and API paths, and maps unexpected paths to a single
`/private-workspace` category.

The mapping includes only safe aggregate labels such as `/overview`,
`/discover`, `/activity`, `/sources` and `/methodology`.
No custom events, user IDs, emails, company names, analyst notes, watchlists,
search terms, or source excerpts are transmitted by our code. The third-party
script will still receive permitted aggregate page visits once enabled; review
the provider's data/consent policies before enabling it for a private app.

**To activate:** redeem the [Simple Analytics offer](https://education.github.com/pack/),
create a website entry for the deployed host, configure
`IVR_SIMPLE_ANALYTICS_ENABLED=true` in that host's environment,
and **redeploy**. It does not require an API key. Leave disabled until
the site's privacy notice is updated as appropriate.

## 3. BrowserStack — real-mobile public entry smoke

**Files:** `core/education-browserstack.mjs`,
`scripts/browserstack-smoke.mjs`,
`.github/workflows/browserstack-mobile-smoke.yml`.

This is an actual W3C WebDriver session client using Node's built-in
`fetch` rather than adding Selenium/Playwright dependencies to the
production application. It creates a BrowserStack real-device mobile
Chrome session, opens **only the public HTTPS site origin**, checks the
document has loaded and shows Illinois Venture Radar or its trusted ChatGPT
sign-in gate, then deletes the session in a `finally` block.
It never logs credentials or page contents and is not a full authenticated E2E
suite. A private ChatGPT Site must be reachable by BrowserStack to test even
its sign-in gate. If not, use an authorized publicly reachable staging login
surface or skip this integration; do **not** expose private investor data.

**To activate:** redeem [BrowserStack Student Pack](https://education.github.com/pack/)
and in GitHub **Actions Secrets** set
`IVR_BROWSERSTACK_USERNAME` and `IVR_BROWSERSTACK_ACCESS_KEY`. In **Actions Variables**
set `IVR_BROWSERSTACK_SITE_URL` to a public HTTPS origin, not a private
company/profile or secret-bearing URL. Optionally set
`IVR_BROWSERSTACK_DEVICE` (default `Samsung Galaxy S20`) and
`IVR_BROWSERSTACK_OS_VERSION` (default `10.0`). Confirm the device/version
is actually available in your account; then set
`IVR_BROWSERSTACK_ENABLED=true`. Run **Actions → BrowserStack student
mobile smoke → Run workflow**. It is manual, not scheduled, to respect the
Pack's limited concurrency and quota.

## 4. Codecov — test analytics, not claimed whole-app coverage

**File:** `.github/workflows/codecov-test-analytics.yml`.

An optional workflow runs the full Node test suite with the built-in **JUnit**
reporter and uploads the resulting test-report XML to Codecov v5
(`report_type: test_results`). No dependency is added to the app,
no coverage percentages are invented, and no external account is contacted
until the opt-in variable is set. The existing main CI test/type/lint/build
checks remain authoritative and continue to work without Codecov.

**To activate:** claim [Codecov Student Pack](https://education.github.com/pack/)
and connect this GitHub repository to Codecov. Add the repository upload
token as a GitHub Actions **Secret** named `CODECOV_TOKEN`, then set the
Actions **Variable** `IVR_CODECOV_ENABLED=true`. Manually dispatch the
`Codecov Student Pack test analytics` workflow or push a later commit to
main. This uploads JUnit **test results**, not uninstrumented browser routes
or general React coverage. The third-party upload may contain test names and
file paths but no credentials or stored company research data.

## 5. GitHub Codespaces — repeatable developer setup

**File:** `.devcontainer/devcontainer.json`.

Uses Microsoft's official Node 22 devcontainer image, pins pnpm 11.25.0 with
Corepack, installs the repository's exact frozen lockfile, forwards ports
3000 and 8787, and recommends ESLint/Prettier/Copilot extensions. Works
without provider credentials. Start a new Codespace from the repository's
**Code → Codespaces** menu and run `pnpm test`, `pnpm typecheck`, or
`pnpm dev`. The local Cloudflare D1 binding and ChatGPT Sites identity
still require supported environment setup; Codespaces does not gain
production administrator privileges or bypass the login.

## 6. Dependabot — safe upstream updates

**File:** `.github/dependabot.yml`.

Checks pnpm/npm dependencies and GitHub Actions versions weekly,
grouping minor/patch updates and keeping the review queue bounded.
Dependabot creates reviewable PRs; it does not deploy dependencies.
Major upgrades must be evaluated manually, with existing tests green.
This uses GitHub's built-in Dependabot service, subject to repository
configuration and availability. No external API key is required.

## Security and activation checklist

- **Current default:** no external services activated, no API credentials
  committed and no ChatGPT Sites/D1 deployment performed.
- **Never paste passwords, access keys, or check-in URLs into GitHub source,
  pull-request comments, issue descriptions, or public chats.** Use GitHub
  Actions Secrets and runtime secret stores.
- Activate integrations individually and validate on staging before
  production. Verify your Student Pack entitlements; listed benefits do not
  imply this account has claimed them.
- Honeybadger applies to the **already opt-in** refresh job. It does not
  enable source crawling or circumvent restricted upstream websites.
- BrowserStack and Codecov jobs do not execute when their corresponding
  Actions variables are unset. Analytics does not load unless deliberately
  enabled in the deployed production environment.
- There are no API tokens, fake keys, paid-tier assumptions, or provider
  account identifiers in the committed source.

## Required credentials (after account setup)

| Integration | GitHub Actions secret or runtime setting | Needed from you |
| --- | --- | --- |
| Honeybadger | `IVR_HONEYBADGER_CHECKIN_URL` (secret) | Full check-in endpoint URL |
| BrowserStack | `IVR_BROWSERSTACK_USERNAME`, `IVR_BROWSERSTACK_ACCESS_KEY` (secrets) | Username and Automate access key |
| Codecov | `CODECOV_TOKEN` (secret) | Repository upload token |
| Simple Analytics | `IVR_SIMPLE_ANALYTICS_ENABLED=true` (host setting) | No API key; registered website domain |
| GitHub Codespaces | None | Optional: eligible Education Pack/organization access |
| Dependabot | None | Optional: enable Dependabot in repository settings |

**Existing values remain separate:** the GitHub Actions source refresher also
requires `IVR_SITE_URL`, `IVR_ADMIN_TOKEN`, and potentially
`IVR_SITES_SERVICE_TOKEN`, which are Patch 2 requirements. Patch 4 does not
create or substitute those credentials.

## Verification

`tests/education-pack.test.mjs` and
`tests/education-pack-integration.test.mjs` test invalid origins,
missing keys, secret-safe errors, transport failures, mocked W3C session
lifecycle, session cleanup, private path redaction, disabled-by-default
configurations, and successful/failing scheduled refresh heartbeats.

Full GitHub Actions test/type/lint/build results should be checked on the
**latest Patch 4 branch head**. Provider-side signup, Honeybadger alerting,
mobile device browser execution, Codecov uploads, Codespaces launch and the
separately deployed site's CSP and authentication require account setup and
cannot be truthfully declared tested before credentials are supplied.
