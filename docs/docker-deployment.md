# Docker Deployment

This documentation walks through how to deploy Headsign using Docker and using the project's Dockerfiles.

> [!TIP]
> For most users, you should be fine to just use the prebuilt Docker images available on [Docker Hub](https://hub.docker.com/r/jasonad123/headsign) or the [project's package page](https://github.com/jasonad123/headsign/pkgs/container/headsign). These instructions are for individuals/organizations who prefer to build and/or need to build from Dockerfiles on their own.

## Included Dockerfiles

This project has four Dockerfiles:

- [Dockerfile](/Dockerfile) - the primary Dockerfile with BuildKit cache mounts (this is how we build all standard images)
- [Dockerfile.dhi](/Dockerfile.dhi) - exactly the same as Dockerfile but uses [Docker hardened images](https://hub.docker.com/hardened-images/catalog) as its base
- [Dockerfile.railway](/Dockerfile.railway) - a Dockerfile optimized for Railway's build process, by removing cache mounts.
- [Dockerfile.legacy](/docker-legacy/Dockerfile.legacy) - the "original" Dockerfile for this project, used on Docker builds before v1.3.2

## Included Docker Compose files

This project has two Docker Compose files:

- [compose.yaml](/compose.yaml) - a production-ready Docker Compose file that uses the prebuilt Docker image
- [compose.dev.yaml](/compose.dev.yaml) - a Docker Compose file that builds the Docker image and has dev settings. This is what **this documentation** will use.

## Deployment instructions

These instructions assume you've followed steps 1 and 2 in the Docker section in [docs/getting-started.md](/docs/getting-started.md)

1. **Clone repository and configure environment variables:**

```bash
# clone the repository
git clone https://github.com/jasonad123/headsign.git
cd headsign

# copy the .env.example file
cp .env.example .env

# Review and edit .env file with your API key
nano .env
```

2. **Deploy Using Docker Compose:**

```bash
# Production build
docker compose -f compose.dev.yaml --profile production up -d

# View logs
docker compose logs

# Stop
docker compose down --remove-orphans
```

For development with hot reload:

```bash
# copy the .env.example file to env.development
# and change the variables as necessary
cp .env.example .env.development.local

# then use this command to start the Docker Compose file with the dev server
docker compose -f compose.dev.yaml --profile dev up

# Stop this
docker compose down --remove-orphans
```

3. **Using Docker build directly:**

```bash
# Build the SvelteKit image
docker build -f Dockerfile .

# Run the container
docker run -p 8080:8080 --env-file .env headsign-svelte
```
