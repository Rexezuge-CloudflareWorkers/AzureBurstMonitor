# Azure Burst Monitor

A Cloudflare Workers application that fetches and displays CPU burstable credit and utilization metrics for Azure B-series virtual machines.

## Overview

Azure B-series VMs use a CPU credit model — they accumulate credits when idle and spend them during burst workloads. This tool queries Azure Monitor live and presents the three key metrics in a single table:

| Metric | Description |
|---|---|
| **CPU %** | Current CPU utilization (average over the last minute) |
| **Credits Consumed** | CPU credits spent in the last period |
| **Credits Remaining** | Available burst credits |

Data is fetched on demand. Click **Refresh** to re-query Azure.

## Architecture

pnpm monorepo with a Cloudflare Worker backend and a React SPA frontend, mirroring the [Mail-Otter](../Mail-Otter/) codebase pattern.

```
azure-burst-monitor/
├── apps/
│   ├── api/          # Cloudflare Worker — Hono + Chanfana, Azure REST calls
│   └── web/          # Vite + React 19 + Tailwind CSS 4 SPA
└── packages/
    ├── shared/           # VirtualMachine and VmMetrics types
    ├── backend-errors/   # IServiceError hierarchy (Hono-compatible)
    └── backend-runtime/  # AbstractEntrypointWorker base class + Env interface
```

**API endpoints**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vms` | List all B-series VMs in the subscription |
| `GET` | `/api/metrics?resourceId=<encoded>` | Fetch CPU metrics for a single VM |
| `GET` | `/docs` | OpenAPI docs (Chanfana) |

**Azure calls made**

- `POST login.microsoftonline.com/{tenant}/oauth2/v2.0/token` — client credentials token
- `GET management.azure.com/subscriptions/{sub}/providers/Microsoft.Compute/virtualMachines` — list VMs, paginated, filtered to `Standard_B*`
- `GET management.azure.com/{resourceId}/providers/microsoft.insights/metrics` — last 60 min at 1-min granularity, `Average + Total` aggregation

All Azure communication uses raw `fetch()` — no Azure SDK dependencies.

## Prerequisites

- [Volta](https://volta.sh/) — pins Node.js and pnpm versions automatically
- A Cloudflare account with Workers enabled
- An Azure service principal with **Reader** role on the target subscription

### Create a service principal

```bash
az ad sp create-for-rbac \
  --name azure-burst-monitor \
  --role Reader \
  --scopes /subscriptions/<SUBSCRIPTION_ID>
```

Note the `appId` (client ID), `password` (client secret), and `tenant` values from the output.

## Local development

**1. Install dependencies**

```bash
source ~/.customrc
volta run pnpm install --ignore-scripts
node scripts/ensure-spa-shell-stub.mjs
NODE_OPTIONS=--max-old-space-size=512 volta run npx wrangler types --config ./wrangler.jsonc --env-interface CloudflareEnv
```

> `--ignore-scripts` avoids an OOM during the automated `postinstall` typegen step. Run the two follow-up commands manually instead.

**2. Configure secrets**

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```ini
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id        # service principal appId
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SUBSCRIPTION_ID=your-subscription-id
SERVE_SPA_FROM_WORKER=true
```

**3. Build the SPA**

```bash
volta run pnpm --filter @azure-burst-monitor/web run build
```

**4. Start the Worker**

```bash
volta run npx wrangler dev --config wrangler.jsonc
```

Open [http://localhost:8787](http://localhost:8787).

### Web hot-reload (optional)

Run Vite's dev server in parallel with the Worker for instant frontend iteration. The Vite server proxies `/api` to the Worker at `:8787`.

```bash
# Terminal 1
volta run npx wrangler dev --config wrangler.jsonc

# Terminal 2
volta run pnpm --filter @azure-burst-monitor/web run dev
```

Open [http://localhost:5173](http://localhost:5173) for the hot-reloading SPA.

## Deployment

**1. Push secrets to Cloudflare**

```bash
volta run npx wrangler secret put AZURE_TENANT_ID
volta run npx wrangler secret put AZURE_CLIENT_ID
volta run npx wrangler secret put AZURE_CLIENT_SECRET
volta run npx wrangler secret put AZURE_SUBSCRIPTION_ID
```

**2. Build and deploy**

```bash
volta run pnpm --filter @azure-burst-monitor/web run build
volta run npx wrangler deploy --config wrangler.jsonc
```

The SPA is embedded in the Worker bundle via the `spa-shell-embed` Vite plugin — no separate static hosting needed. Set `SERVE_SPA_FROM_WORKER=true` in `wrangler.jsonc`'s `vars` section (or use Cloudflare Assets for separate static serving).

## Development commands

```bash
# Type-check all packages
volta run pnpm run typecheck

# Regenerate Worker types after changing wrangler.jsonc
NODE_OPTIONS=--max-old-space-size=512 volta run pnpm run typegen

# Lint
volta run pnpm run lint

# Format
volta run pnpm run prettier
```

## Layer rules

Import direction is enforced by ESLint:

```
Layer 0: shared, backend-errors    — no @azure-burst-monitor/* imports
Layer 1: backend-runtime           — may import layer 0 only
Layer 2: apps/api                  — may import layers 0–1
```

`apps/api/src/services/` holds the Azure-specific fetch logic. It is intentionally not extracted into a shared package since there is only one consumer.
