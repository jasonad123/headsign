# Local testing/deployment (advanced users only)

This documentation walks through how to deploy Headsign using `pnpm`.

> [!CAUTION]
> This method is **not recommended** for production deployments. Use Docker or a PaaS platform instead.
> **Only use this if** you're actively developing Headsign or need to make custom modifications.

1. **Install prerequisites**:

```bash
# Install Node.js 24.x
# See: https://nodejs.org/en/download/package-manager

# Install pnpm
npm install -g pnpm
```

2. **Clone and setup**:

```bash
git clone https://github.com/jasonad123/headsign.git
cd headsign

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env
# Edit .env with your API key
```

3. **Build and run**:

```bash
# Build SvelteKit app
cd svelte-app
pnpm install
pnpm build
cd ..

# Start the server
pnpm start
```

4. **Access**: Navigate to `http://localhost:8080`

For development with hot reload:

```bash
# Terminal 1: Start SvelteKit dev server
cd svelte-app && pnpm dev

# Terminal 2: Start Express backend
pnpm start
```

Then access the app at `http://localhost:5173` (Vite dev server with hot reload)

#### CORS Configuration (advanced)

**Note:** CORS is automatically disabled in production deployments. In production, SvelteKit and Express run on the same origin (port 8080), so cross-origin requests don't occur and CORS headers are not needed.

CORS is only enabled during local development when running SvelteKit dev server (port 5173) separately from the Express backend (port 8080).

For development, the default allowed origin is `http://localhost:5173`. If you need to allow additional origins during development:

```bash
# Development only - allow SvelteKit dev server
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
```

**Production deployments do not require ALLOWED_ORIGINS configuration.** Each deployment is self-contained and serves both frontend and backend on the same origin.
