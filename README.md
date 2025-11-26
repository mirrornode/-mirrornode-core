# mirrornode-core

This repository now contains a lightweight HTTP service, automated tests, Docker packaging, and GitHub/Vercel deployment hooks so the codebase is ready for production hardening.

## Repository layout

- `app/` — Node.js service exposing readiness (`/`) and health (`/health`) endpoints
- `Dockerfile` — container image definition for the service
- `docker-compose.yml` — local development runner
- `.github/workflows/` — CI pipelines for tests and image builds
- `vercel.json` — configuration for deploying the service to Vercel

## Local development

Run the service directly with Node:

```bash
cd app
npm start
```

Execute the built-in test suite:

```bash
cd app
npm test
```

Build and run the container locally:

```bash
docker build -t mirrornode-core:local .
docker compose up --build
```

## Continuous integration & delivery

- **Build and Test** (`.github/workflows/build-test.yml`) runs on every push/PR. It installs dependencies, executes the Node test runner, and performs a Docker build to ensure image compatibility.
- **Build and Push** (`.github/workflows/build-and-push.yml`) builds multi-architecture images on pushes to `main` and pushes them to `ghcr.io/${{ github.repository_owner }}/mirrornode-core:latest`. Configure the `REGISTRYUSERNAME` and `REGISTRYPASSWORD` secrets with credentials that can push to your container registry.

## Vercel deployment

Deploy the service to Vercel by importing the repository in the Vercel dashboard. The included `vercel.json` routes all traffic to `app/vercel.js`, which reuses the same HTTP handlers as the Node server.

## Next steps

- Expand the API surface or integrate with upstream data sources.
- Harden observability (structured logs, metrics) and add more coverage for edge cases.
- Swap the runtime for another language/framework if requirements change.
