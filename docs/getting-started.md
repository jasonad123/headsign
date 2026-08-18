# Getting started

Headsign is a web application that can be deployed in various ways to suit different organizational needs and technical capabilities. This guide walks through the available deployment options, from simplest to most complex.

## Prerequisites

### Transit API Key

Regardless of deployment method, you'll need an API key from Transit:

- Request a key from the [Transit API page](https://transitapp.com/partners/apis)
  - **For testing or very limited use**: The default free tier **should be adequate**
  - **For production deployments**: You'll need a paid tier API key

**Transit partners**: If your agency subscribes to Transit Royale or has other relationships with Transit, contact your account representative for API access information.

### Display Hardware

You'll need display hardware to show the Headsign interface. Options range from:

- Simple: Monitor connected to a PC or mini-PC
- Moderate: Raspberry Pi with display
- Advanced: Dedicated digital signage displays

## Deployment Options

### Option 1: One-Click Deployment (Railway) - Recommended for Most Users

**Best for**: Organizations comfortable with cloud PaaS platforms and looking for quickest setup

Railway provides a one-click deployment experience:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/kYRHes?referralCode=9qzudG&utm_medium=integration&utm_source=template&utm_campaign=generic)

**What happens when you click**:

1. You'll be guided through creating a Railway account (if needed)
2. You'll configure your API key and settings for Headsign
3. Railway creates a new project for Headsign
4. Railway automatically deploys the _latest_ Docker image for Headsign
5. Your Headsign instance is live

**Configuration**:

- Custom domains can be added through Railway's dashboard
- Environment variables can be updated anytime
- Multiple instances can be deployed for different displays

**Costs**: Railway charges based on usage. Check [Railway's pricing](https://railway.com/pricing) for current rates.

**Demo instance**: [see it in action](https://headsign-demo.up.railway.app/)

### Option 1B: One-Click Deployment (Render)

**Best for**: Organizations comfortable with cloud PaaS platforms and specifically familiar with Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fjasonad123%2Fheadsign)

**What happens when you click**:

1. You'll be guided through creating a Render account (if needed)
2. You'll configure your API key and basic settings for Headsign
3. Render creates a new project for Headsign
4. Render automatically deploys the _latest_ Docker image for Headsign as a Web Service
5. Your Headsign instance is live

**Configuration**:

- Custom domains can be added through Render's dashboard
- Environment variables can be updated anytime
- Multiple instances can be deployed for different displays

### Option 2: Manual Cloud Platform Deployment

**Best for**: Organizations preferring other PaaS providers or needing specific features

Headsign works with any Docker-compatible PaaS platform. Currently it has only been tested and deployed on Railway and has had test deployments on **Render** and _should_ be supported by **Fly.io**.

- **Railway** - Recommended, full template support
- **Render** - Good alternative, straightforward setup with template support
- **Fly.io** - Global edge deployment, good for multi-location agencies

#### General Setup Steps

1. **Create account** on your chosen platform
2. **Create new service** from Docker image
3. **Configure Docker image**:
   - Docker Hub: `jasonad123/headsign`
     - Alternative: GitHub repository: `ghcr.io/jasonad123/headsign` (this is also the _only_ option for pre-release images)
   - Tag: `latest` (for stable) or specific version tag
4. **Set environment variables**:
   ```bash
   TRANSIT_API_KEY=your_api_key_here
   SESSION_SECRET=any-long-secret-however-the-platform-generates-it
   PORT=8080
   NODE_ENV=production
   ```
5. **Optional: Configure [unattended setup](../docs/config/unattended-setup.md)**
6. **Deploy** and access your instance

#### Platform-Specific Guides

**Render**:

```yaml
# render.yaml
services:
  - type: web
    name: Headsign
    runtime: docker
    image:
      url: ghcr.io/jasonad123/headsign:latest
    envVars:
      - key: TRANSIT_API_KEY
        sync: false
      - key: SESSION_SECRET
        generateValue: true
      - key: ENABLE_SERVER_CACHE
        sync: false
      - key: PORT
        value: 8080
      - key: NODE_ENV
        value: production
```

**Fly.io**:

```toml
# fly.toml
app = "your-headsign"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

### Option 3: Docker Deployment (VPS or On-Premise) - Recommended for Self-Hosted

**Best for**: Organizations with existing infrastructure, on-premise requirements, or cost optimization

#### Prerequisites

- Server/VM with Docker installed
- SSH or console access to the server
- Domain name (optional but recommended)

#### Installation Steps

1. **Install Docker** (if not already installed):

   ```bash
   # Follow instructions on https://docs.docker.com/engine/install/ to add the Docker repositories for your package manager
   # Once the repositories are added - install Docker according to the right method for your distro

   # Ubuntu/Debian based
   sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

   # RHEL/Fedora based
   sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

   # Start the Docker service
   sudo systemctl start docker

   # Test Docker
   sudo docker run hello-world

   ```

2. **Create environment file**:

   ```bash
   # Create a directory for Headsign
   mkdir -p ~/headsign
   cd ~/headsign

   # Create .env file
   cat > .env << EOF
   TRANSIT_API_KEY=your_api_key_here
   SESSION_SECRET=$(openssl rand -base64 32)
   PORT=8080
   NODE_ENV=production
   EOF
   ```

3. **Pull and run the Docker image**:

   ```bash
   # Pull the latest image from Docker Hub
   docker pull jasonad123/headsign:latest

   # OR pull the latest image from GitHub
   # docker pull ghcr.io/jasonad123/headsign:latest

   # Run the container
   docker run -d \
     --name headsign \
     --restart unless-stopped \
     -p 8080:8080 \
     --env-file .env \
     jasonad123/headsign:latest
   ```

4. **Verify deployment**:

   ```bash
   # Check container status
   docker ps

   # View logs
   docker logs headsign
   ```

5. **Access your instance**:
   - Local: `http://localhost:8080`
   - Remote: `http://your-server-ip:8080`

#### Using Docker Compose (Recommended)

For easier management, use Docker Compose:

1. **Create `compose.yaml`**:

   ```yaml
   services:
     headsign:
       image: jasonad123/headsign:latest
       container_name: headsign
       restart: unless-stopped
       ports:
         - '8080:8080'
       environment:
         - TRANSIT_API_KEY=${TRANSIT_API_KEY}
         - SESSION_SECRET=${SESSION_SECRET}
         - PORT=8080
         - NODE_ENV=production
       # Optional: for unattended setup
       # - UNATTENDED_SETUP=true
       # - UNATTENDED_LOCATION=40.7240,-74.0002
       # - UNATTENDED_TITLE=Transit Display
   ```

2. **Deploy**:

   ```bash
   # Start
   docker compose up -d

   # View logs
   docker compose logs -f

   # Stop
   docker compose down

   # Update to latest version
   docker compose pull
   docker compose up -d
   ```

### Reverse Proxy Setup (Recommended for Production)

For SSL/TLS and custom domains, use a reverse proxy like Nginx or Caddy:

**Caddy** (easiest, automatic HTTPS):

```caddy
headsign.youragency.com {
    reverse_proxy localhost:8080
}
```

**Nginx**:

```nginx
server {
    listen 80;
    server_name headsign.youragency.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Reverse proxy alternatives

Headsign has been tested to work behind both **Cloudflare Tunnels** and **Tailscale** (both natively and behind Tailscale Funnels). If your organization uses either of these programs, consider these as reverse proxy alternatives that don't
require opening ports.

### Option 4: Direct Node.js Deployment (Development Only)

> [!CAUTION]
> This method is **not recommended** for production deployments. Use Docker or a PaaS platform instead.
> **Only use this if** you're actively developing Headsign or need to make custom modifications.

See [docs/local-deployment](/docs/local-deployment.md) for more information.

## Configuration

### Unattended Setup

Headsign supports automatic configuration on first launch, ideal for deploying multiple instances at once.

See the documentation for [unattended setup](../docs/config/unattended-setup.md)] for more information on available variables.

### Caching

Headsign also has built-in caching. Caching can be adjusted based on your Transit API subscription.

See the documentation for [caching](../docs/config/caching.md)] for more information on the caching setup.

## Updating Your Deployment

### Railway

Updates are automatic when new versions are tagged, or you can manually redeploy from the dashboard.

If you're using the Railway template, the default settings will automatically update the Docker image at 7 AM UTC (3 AM EST, 12 AM PST).

### PaaS Platforms

Most platforms support automatic updates or can be configured to pull the latest image on a schedule.

### Docker Compose

```bash
docker compose pull
docker compose up -d
```

### Docker (Manual)

```bash
# Pull latest image
docker pull jasonad123/headsign:latest

# Stop and remove old container
docker stop headsign
docker rm headsign

# Start new container (using same command as initial deployment)
docker run -d --name headsign --restart unless-stopped -p 8080:8080 --env-file .env jasonad123/headsign:latest
```

## Monitoring and Maintenance

### Health Checks

Headsign exposes a health check endpoint at `/health` that returns:

```json
{
	"status": "healthy",
	"timestamp": "2025-12-18T16:00:00.000Z",
	"version": "1.3.0",
	"uptime": 3600,
	"environment": "production"
}
```

Use this for monitoring:

- **Cloud platforms**: Configure platform-specific health checks
- **Self-hosted**: Use monitoring tools like Uptime Kuma, Healthchecks.io

### Logs

**Docker (including Docker Compose)**:

```bash
# View logs
docker logs headsign

# Follow logs in real-time
docker logs -f headsign

# Last 100 lines
docker logs --tail 100 headsign
```

**Docker Compose**:

```bash
docker compose logs -f
```

### Resource requirements

**Minimum**:

- 512 MB RAM
- 1 CPU core
- 500 MB disk space

**Recommended** (for smooth operation):

- 1 GB RAM
- 2 CPU cores
- 1 GB disk space

### Quick Checks

1. **Container not starting**:

   ```bash
   docker logs headsign
   ```

2. **API key issues**:
   - Verify API key is correct
   - Check API quota/limits
   - Ensure key has necessary permissions

3. **Connection issues**:
   - Verify firewall allows traffic on port 8080
   - Check security group settings (cloud deployments)
   - Ensure port is not already in use

4. **Display not updating**:
   - Check API key validity
   - Verify location coordinates are correct
   - Check browser console for errors

## Support

- **Issues**: [GitHub Issues](https://github.com/jasonad123/headsign/issues)

---

_This documentation was prepared with assistance from agentic coding tools._
