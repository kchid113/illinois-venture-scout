# Option A frontend — Illinois navy and orange investor workspace

## Scope

Applies the selected high-contrast **Option A** design language to the existing
Illinois Venture Radar Next/Vinext app. This is a real front-end implementation,
not a static screenshot and not a separate demo application.

- UIUC-inspired palette: Illinois navy `#13294b` and orange `#ff5f05`, with a navy
  persistent research navigation, orange active states, and light content cards.
- Clear landing hero with one primary **Explore startups** CTA and a secondary
  **How we verify sources** action, plus an inline, locally drawn dome
  illustration. No remote images, generated logos, added trackers, or invented
  customer logos.
- Dashboard counters remain bound to the real D1 `summary()` values. No
  fabricated funding, traction, portfolio counts, or recommendations.
- Discover, watchlists, compare, activity, research, sources, evidence drawer
  and settings retain their existing client functions and routes.
- Responsive layout preserves table scrolling, mobile navigation, and keyboard
  focus, with practical 550px/850px breakpoints.

## Each startup profile

The previous long text-only overview is replaced by structured panels:

1. **Company brief** — source-backed product description, technology, sector,
   ecosystem link and verified stage, with original-claim citations.
2. **Founder access** — visibly distinguished verified founder names, directly
   source-supported founder email/LinkedIn if available, and official
   company/website links when direct contact is unverified.
3. **Product and commercialization** — supported technology, business model,
   market and customer statements; unknown fields stay unknown.
4. **Team and university connection** — separate source-backed founder,
   university affiliation, accelerator and incubator statements.
5. **Capital and momentum** — financing, awards, traction and status shown
   **only if individually supported**. University participation does not
   become an investment or operating status.
6. **Evidence overview** — original linked publisher URLs, checked dates and
   a button to the existing full source/evidence panel.
7. **Investment diligence** — research questions and explicit unknowns, not
   invented traction signals or automated investment recommendations.

The top of **every** company page has a **Founder contact** shortcut to the
outreach panel. A published direct email is clickable as `mailto:`; a
published founder profile is a bounded public HTTPS link. For companies where
the sources do not establish a direct channel, the panel says so clearly and
links to the documented company website or official company listing.

## Investor-private contact book

An investor may add a contact name, business email, public profile URL and
outreach note for each company. This contact is an **analyst-entered private
workspace item**, never a published founder claim and never shared between
investors. It uses existing signed-in `workspace` storage scoped by user ID,
or the existing device-local fallback. The API adds only a new `contact` item
kind; no database migration or third-party messaging service is required.

Private contact details are validated on **both the client and server**.
Emails reject whitespace/control characters and malformed addresses; profile
links require public, credential-free HTTPS without redirects/query/fragment
parameters. The UI labels all saved contact data as private/unverified; it
does not infer contact identities or scrape personal addresses.

## Verification

Run `node --test tests/founder-outreach.test.mjs` plus the full CI suite,
TypeScript typecheck, lint, and standalone Cloudflare Worker build. Tests cover
unsourced and conflicting contacts, safe mailto/link generation, fallback to
official company profiles, private workspace per-user isolation, and known
startup profile routes. No production deployment occurs from a pull request.
