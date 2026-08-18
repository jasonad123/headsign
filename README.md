# Headsign

A real-time transit display application that shows arrival times for nearby public transit.

![Screenshot](/assets/headsign-screenshot.png)

<div style="text-align:center">

<img src="https://github.com/jasonad123/headsign/blob/main/assets/transit-api-badge.png?raw=true" width="25%" />

</div>

> [!NOTE]
> Headsign is a rewrite of the original [Transit TV](https://github.com/TransitApp/Transit-TV) application by the Transit team, rebuilt in a modern stack with significant feature additions.
> The original AngularJS fork is preserved on the [legacy branch](https://github.com/jasonad123/headsign/tree/legacy).

> [!WARNING]
> Headsign comes with no guarantee of any kind. I am **not** affiliated with Transit, just a big fan of their app.

## Prerequisites

- An API key from Transit - [keys can be requested here](https://transitapp.com/partners/apis)

Optional, for local deployment or development only

- Docker (recommended)
- Node.js (version specified in .node-version, for development/local deployment purposes only)
- pnpm (preferred package manager, for development/local deployment purposes only)

## Getting started

Go to the [Transit API page](https://transitapp.com/partners/apis) and request access to the API. When you have the API key, you can place it in your environment `.env` file or however variables/secrets are managed for your deployment method.

Once you have your API key, see [docs/getting-started](docs/getting-started.md) for more info on how to get started.

## Project structure

```bash
.
├── docs/                 # Documentation
├── docker-legacy/        # Legacy Docker files for backwards compatibility
├── e2e/                  # end-to-end testing related files
├── server/
│   ├── api/              # API endpoints
│   ├── config/           # Server configuration
│   ├── components/       # Custom server components
│   └── routes.js         # Express routing
├── svelte-app/           # SvelteKit application
│   ├── src/
│   │   ├── routes/       # SvelteKit routes and API endpoints
│   │   ├── lib/          # Components, stores, utilities
│   │   └── app.css       # Global styles
│   ├── static/           # Static assets like images and fonts
│   └── package.json      # SvelteKit dependencies
├── .env.example          # Example environment variables
├── Dockerfile            # Docker build file
├── compose.yaml          # Docker Compose file (production)
└── compose.dev.yaml      # Docker Compose (development)
```

## License

See the [LICENSE](LICENSE) file for details.

## Additional Disclaimers

> [!NOTE]
> **Generative AI:** The code for this project was developed with the help of generative AI tools, including Claude and Claude Code. While all outputs have been _lovingly_ reviewed and tested, users should validate results independently before use in production environments.
