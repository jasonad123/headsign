# Headsign - Svelte 5

Real-time transit departure display built with Svelte 5 + SvelteKit 2 + TypeScript.

## Quick Start

### Option 1: With Backend (Full Features)

Terminal 1 - Start Express backend:

```bash
cd /Users/jasonadle/GitHub/headsign
pnpm install
pnpm start
```

Terminal 2 - Start Svelte dev server:

```bash
cd svelte-app
pnpm install
pnpm dev
```

Visit [http://localhost:5173](http://localhost:5173)

### Option 2: Standalone (Development)

```bash
cd svelte-app
pnpm install
pnpm dev
```

Note: API calls will fail without the backend. The app uses SvelteKit API routes that proxy to Express on port 8080.

## Environment Variables

```bash
# Backend URL (default: http://localhost:8080)
BACKEND_URL=http://localhost:8080
```

## Build

```bash
pnpm build
pnpm preview
```

## Production Deployment

The SvelteKit app can be deployed in two ways:

### Option 1: Integrated with Express (Recommended)

The Express backend serves the SvelteKit build when `USE_SVELTE=true`:

```bash
# Build SvelteKit
cd svelte-app && pnpm build && cd ..

# Start Express with SvelteKit
USE_SVELTE=true pnpm start
```

Express configuration dynamically loads the SvelteKit handler and serves:

- Static assets from `svelte-app/build/client`
- SSR pages via `svelte-app/build/handler.js`
- API routes from `server/api/*`

### Option 2: Docker Deployment

```bash
# Build and run with Docker
docker build -f Dockerfile.svelte -t headsign-svelte .
docker run -p 8080:8080 --env-file .env.docker headsign-svelte

# Or with Docker Compose
docker compose up
```

### API Integration

Backend endpoints (served by Express on port 8080):

- `/api/routes/nearby` - Get nearby transit routes
- `/api/config/unattended` - Get unattended setup config
- `/api/images/*` - Get route images

In development, SvelteKit proxies these via server routes in `src/routes/api/`.
In production, Express serves both the SvelteKit app and API routes.

## Features Migrated

All 9 core features from AngularJS app:

1. Nearby routes display
2. Departure time display
3. Route filtering
4. Route reordering
5. Configuration UI
6. Internationalization (en/fr)
7. Unattended setup
8. Responsive design
9. Service alerts (scrolling ticker + route badges)

## Architecture

```
svelte-app/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── AlertTicker.svelte
│   │   │   └── RouteItem.svelte
│   │   ├── services/
│   │   │   ├── nearby.ts
│   │   │   └── alerts.ts
│   │   └── stores/
│   │       └── config.ts
│   └── routes/
│       ├── api/                    # SvelteKit API routes (proxy to Express)
│       │   ├── routes/nearby/
│       │   ├── config/unattended/
│       │   └── images/[...path]/
│       ├── +layout.svelte
│       └── +page.svelte
└── package.json
```

## Performance

- Bundle size: ~40 KB gzipped (vs 200 KB AngularJS)
- Build time: <2s (vs 10-20s Grunt)
- Dependencies: 70 packages (vs 1,000+ AngularJS)
- Framework: Svelte 5 (modern, maintained)

## TypeScript

Full TypeScript support with strict type checking.

```bash
pnpm check      # Type check
pnpm run build  # Build for production
```

## Troubleshooting

**404 errors for /api endpoints:**

- Ensure Express backend is running on port 8080
- Check BACKEND_URL environment variable
- SvelteKit dev server proxies API calls to Express

**Build fails:**

- Run `pnpm check` to see TypeScript errors
- Ensure Node.js 20.18+ is installed
