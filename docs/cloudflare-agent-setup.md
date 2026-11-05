# Cloudflare coding-agent setup for Illinois Venture Radar

These project-level files follow [Cloudflare's official agent setup prompt](https://developers.cloudflare.com/agent-setup/prompt.md), retrieved from the [Cloudflare documentation source](https://github.com/cloudflare/cloudflare-docs/blob/main/src/content/agent-setup/prompt.md).

## Prepared in this repository

| Agent environment | File | Format |
| --- | --- | --- |
| GitHub Copilot CLI / portable Copilot | `.mcp.json` | Top-level `mcpServers` |
| Cursor | `.cursor/mcp.json` | Top-level `mcpServers` |
| Visual Studio Code | `.vscode/mcp.json` | Top-level `servers` and `type: http` |
| Coding agents reading repository guidance | `AGENTS.md` | Deployment conventions and safety constraints |

All three MCP configurations point to Cloudflare's official `https://mcp.cloudflare.com/mcp` remote endpoint. They contain **no secrets**. They do **not** install Skills, authenticate anyone or initiate Cloudflare changes.

Cloudflare's generic prompt groups Cursor and Copilot together, but the current [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) explicitly requires the `servers` key for `.vscode/mcp.json`. The correct VS Code shape is used here.

## Activate in your coding agent

An agent with access to this GitHub workspace may discover its MCP configuration. In VS Code, open the repository, start the Cloudflare server from MCP management, and authorize the Cloudflare OAuth login in your own browser, selecting the minimum necessary account permissions. In Cursor, open the repository and enable/authorize the Cloudflare server from MCP settings.

For **Codex** (CLI or desktop), use Codex's Cloudflare plugin marketplace: install `cloudflare@cloudflare` from `cloudflare/skills`. Alternatively, Codex's current official prompt provides:

```bash
npx -y skills add cloudflare/skills --skill '*' --yes --global
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare
```

Those commands apply to the **local Codex installation**, not a ChatGPT web conversation or a GitHub Actions container. Installing Skills and performing MCP OAuth in the user's coding-agent environment requires that agent to be available and the user to grant account access. The official prompt also describes optional beta `cf` CLI installation; it was **not** installed, because it is unnecessary for the existing Wrangler-based deployment and Cloudflare says to ask before installing.

## Existing production deploy — unresolved Access settings

MCP onboarding is **not** equivalent to configuring Cloudflare Zero Trust or deploying Illinois Venture Radar.

The latest recorded attempt of the manual deployment action failed *before remote changes* because the following GitHub **Actions variables** were absent or structurally invalid:

- `CLOUDFLARE_ACCOUNT_ID`: your selected 32-character Cloudflare account ID.
- `IVR_ACCESS_TEAM_DOMAIN`: the exact `https://TEAM.cloudflareaccess.com` origin, no slash at the end.
- `IVR_ACCESS_AUD`: the audience tag of a self-hosted Cloudflare Access application protecting the Worker hostname.

Create the Access application and an explicit Allow policy for authorized investors before re-running the deployment. Your Cloudflare API token belongs in a GitHub Actions **secret** named `CLOUDFLARE_API_TOKEN`. If it has been shared in a chat or other untrusted medium, rotate it before production use.

The independent Worker hostname is intended to be
`illinois-venture-radar.<account-workers-subdomain>.workers.dev`.
Set the Access application to cover the exact hostname; validate that its AUD and team domain match the repository settings. Do not create a permissive Bypass or Everyone policy.

Configure the variables at:
https://github.com/kchid113/illinois-venture-scout/settings/variables/actions

Then trigger the existing manual workflow on `main`:
https://github.com/kchid113/illinois-venture-scout/actions/workflows/cloudflare-deploy.yml

When creating a *new* isolated database, set `create_d1=true`; otherwise use `false`. To stage the reviewed 14 Research Park additions and 243 review-only candidate observations, set `import_source_catalog=true`. Inspect live D1 state before any import and use the workflow's original preflight and rollback safeguards.

## Verification boundary

- Repository MCP JSON files can be validated statically without Cloudflare credentials.
- Authentication must be completed in an MCP-capable coding agent; a ChatGPT conversation that has only GitHub access **cannot** authenticate to or mutate a Cloudflare account using these files.
- The site is **not deployed** merely because a repository has MCP config files.
