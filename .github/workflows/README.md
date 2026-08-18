# Headsign Docker Workflows

This directory contains GitHub Actions workflows for building, publishing, and managing Docker images for Headsign.

## Workflows

### docker-publish.yml

Builds and publishes multi-architecture (amd64, arm64) Docker images to GitHub Container Registry.

**Triggers**:
- Semantic version tags (v1.2.3, v1.2.3-beta.1, v1.2.3-rc.2, etc.)
- Pushes to `main` branch (edge releases)
- Manual workflow dispatch

**Outputs**: Docker images tagged and pushed to `ghcr.io/jasonad123/headsign`

### docker-publish-hardened.yml

Builds and publishes multi-architecture (amd64, arm64) Docker images to GitHub Container Registry using Docker Hardened Images as the base.

**Triggers**:
- Semantic version tags (v1.2.3, v1.2.3-beta.1, v1.2.3-rc.2, etc.)
- Manual workflow dispatch

**Outputs**: Docker images tagged and pushed to `ghcr.io/jasonad123/headsign:hardened-(x)`

### cleanup-images-action.yml

Reliable Docker image cleanup using the proven dataaxiom/ghcr-cleanup-action (v1.0.16).

**Schedule**: Weekly on Sunday at 2 AM UTC

**Features**:

- Handles multi-architecture images and BuildKit attestations correctly
- Regex-based tag filtering
- Enhanced error handling for 404s and permission issues
- Parallel job execution for beta, edge, branch-test, and untagged cleanup

**Retention Policy**:

- Beta builds (beta-*): Keep last 3
- Edge builds (edge-*): Keep last 2
- Branch-test builds: Delete all
- Stable releases (semantic versions): Always retained
- Untagged manifests: Deleted

**Manual Run**: Can be triggered manually with dry_run option (defaults to true)

**Important**: Requires Admin role access to the headsign package in GitHub Settings.

### cleanup-untagged.yml

Removes untagged Docker image manifests (sha256 digests, platform-specific manifests).

**Schedule**: Weekly on Sunday at 2 AM UTC

**Purpose**: Cleanup fallback while cleanup-images.yml is being verified

## Release Process

Headsign follows [Semantic Versioning](https://semver.org/) for all releases.

### Stable Releases

Create a stable release by pushing a semantic version tag:

```bash
git tag v1.3.0
git push origin v1.3.0
```

**Result**:
- Image tagged as: `1.3.0`, `latest`
- Available at: `ghcr.io/jasonad123/headsign:latest`

### Beta Releases

Create a beta prerelease for testing:

```bash
git tag v1.4.0-beta.1
git push origin v1.4.0-beta.1
```

**Result**:
- Image tagged as: `1.4.0-beta.1`, `beta`
- Available at: `ghcr.io/jasonad123/headsign:beta`

**Subsequent betas**: Increment the prerelease number (v1.4.0-beta.2, v1.4.0-beta.3, etc.)

### Release Candidates

Create a release candidate when approaching a stable release:

```bash
git tag v1.4.0-rc.1
git push origin v1.4.0-rc.1
```

**Result**:
- Image tagged as: `1.4.0-rc.1`, `rc`
- Available at: `ghcr.io/jasonad123/headsign:rc`

### Alpha Releases

Create an alpha prerelease for early testing:

```bash
git tag v1.5.0-alpha.1
git push origin v1.5.0-alpha.1
```

**Result**:
- Image tagged as: `1.5.0-alpha.1`, `alpha`
- Available at: `ghcr.io/jasonad123/headsign:alpha`

### Edge Releases

Automatic edge releases are created on every push to `main` branch.

**Result**:
- Image tagged as: `edge-{short-sha}`, `edge`
- Available at: `ghcr.io/jasonad123/headsign:edge`

**Purpose**: Bleeding edge builds for testing latest changes before tagging a release

## Tag Naming Conventions

Follow semantic versioning format: `vMAJOR.MINOR.PATCH[-PRERELEASE]`

**Examples**:
- `v1.0.0` - Stable release
- `v1.1.0-beta.1` - Beta prerelease (first beta for 1.1.0)
- `v1.1.0-beta.2` - Beta prerelease (second beta for 1.1.0)
- `v1.1.0-rc.1` - Release candidate (first RC for 1.1.0)
- `v1.2.0-alpha.1` - Alpha prerelease (first alpha for 1.2.0)

**Prerelease Identifiers**:
- `beta` - Feature complete, testing in progress
- `rc` - Release candidate, final testing before stable
- `alpha` - Early development, unstable
- `dev` - Development builds (not recommended for production use)

## Manual Workflow Dispatch

You can manually trigger docker-publish.yml from the Actions tab with these options:

**Release Types**:
- `beta` - Creates a beta build with timestamp
- `latest` - Creates a latest build (use with caution)
- `branch-test` - Creates a test build from current branch

**Custom Tag** (optional): Specify a custom tag name for the build

## Pulling Images

### Latest Stable

```bash
docker pull ghcr.io/jasonad123/headsign:latest
```

### Specific Version

```bash
docker pull ghcr.io/jasonad123/headsign:1.3.0
```

### Latest Beta

```bash
docker pull ghcr.io/jasonad123/headsign:beta
```

### Latest Edge (from main)

```bash
docker pull ghcr.io/jasonad123/headsign:edge
```

## Cleanup Management

### Manual Cleanup

Trigger cleanup-images.yml manually from the Actions tab:

1. Go to Actions > Cleanup Old Docker Images
2. Click "Run workflow"
3. Set `dry_run` to `false` to execute deletions (defaults to `true`)

**Dry Run**: Preview what would be deleted without actually deleting

### What Gets Cleaned

**Deleted**:
- Old beta builds (keeps last 3)
- Old edge builds (keeps last 2)
- All untagged manifests

**Protected** (never deleted):
- `latest` tag
- `beta`, `rc`, `alpha`, `edge` floating tags
- Semantic version tags (v1.2.3, v1.2.3-beta.1, etc.)

## Multi-Architecture Support

All images are built for:
- `linux/amd64` (x86-64)
- `linux/arm64` (ARM 64-bit, Apple Silicon, Raspberry Pi 4+)

Docker automatically pulls the correct architecture for your platform.

## Cache Strategy

Builds use GitHub Actions cache (`type=gha`) for faster rebuilds:
- Dependency caching with pnpm
- Docker layer caching
- BuildKit cache mounts

## Security

- All actions are pinned to specific commit SHAs
- Images run as non-root user
- No secrets or credentials in image layers
- Automated security scanning via OSV Scanner

## Troubleshooting

### Build Fails

Check the Actions tab for detailed logs. Common issues:
- TypeScript errors in source code
- pnpm lockfile out of sync
- Docker build context issues

### Image Not Available

Verify:
- Tag name follows semantic versioning
- Workflow completed successfully
- Correct registry URL (`ghcr.io/jasonad123/headsign`)

### Cleanup Not Running

Check:
- Workflow is enabled in Actions tab
- `dry_run` is set to `false` for actual deletion
- Sufficient permissions (requires `packages: write`)