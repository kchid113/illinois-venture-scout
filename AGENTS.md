# Illinois Venture Radar — coding-agent guidance

## Cloudflare project architecture

- Source of truth: this GitHub repository, `main` for production.
- Runtime: a dedicated Cloudflare Worker built from the existing Vinext/Vite configuration with a dedicated Cloudflare D1 database. Cloudflare Zero Trust Access protects the application.
- Deploy only through the existing manually dispatched `.github/workflows/cloudflare-deploy.yml` on `main`. Do not bypass the deployment preflight, Access JWT checks, test suite or migration/seed guards.
- Never use an unrelated D1 database, overwrite investor workspace data, auto-approve startup candidates or invent founder contact information.
- The `create_d1` and `import_source_catalog` workflow inputs can mutate remote resources. Obtain explicit user authorization for the exact target before invoking a production deployment.
- Cloudflare Account ID and Access application AUD are *different* identifiers. Store all credentials in GitHub Actions secrets/variables, never repository files or chat messages. Never echo secrets in logs.
- Read `docs/cloudflare-github-deployment.md` and `docs/cloudflare-agent-setup.md` before changing deployment infrastructure.
- Prefer Wrangler when this repository has an existing Worker configuration. Cloudflare's optional beta `cf` CLI is not required.
- Use Cloudflare's official published Skills and API MCP when the **user's coding agent** has them installed and authenticated. Do not mistake a checked-in MCP endpoint definition for an authenticated connection.

## Cloudflare MCP

The official Cloudflare API MCP endpoint is `https://mcp.cloudflare.com/mcp`. Compatible repo-level configs are included for GitHub Copilot (`.mcp.json`), VS Code (`.vscode/mcp.json`), and Cursor (`.cursor/mcp.json`).

This MCP server requires separate user OAuth approval in the agent application. Cloudflare permissions must be reviewed and scoped by the user. The repository config does not install Cloudflare Skills, grant account access, modify Zero Trust policies or trigger a deployment.

Official reference: https://developers.cloudflare.com/agent-setup/prompt.md
